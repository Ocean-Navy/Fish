import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RunnerReceiptSummary } from "@/lib/fishLedger";

type TrustedRunnerKey = {
  keyId: string;
  publicKeyPem: string;
};

export type RunnerReceiptValidationContext = {
  routeId?: string | null;
  providerId?: string | null;
  idempotencyKey?: string | null;
  requestHash?: string | null;
  outputHash?: string | null;
  model?: string | null;
  status?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  providerCostUsd?: number | null;
  maxBudgetUsd?: number | null;
};

export function runnerReceiptSha256(value: string) {
  return `sha256:${sha256(value)}`;
}

export function readAndVerifyRunnerReceipt(payload: unknown, expected?: RunnerReceiptValidationContext): RunnerReceiptSummary | null {
  const receipt = readPath(payload, ["fish_runner"]);
  if (!isRecord(receipt)) {
    return null;
  }

  const canonicalPayload = canonicalRunnerReceiptPayload(receipt);
  const computedCanonicalReceiptHash = `sha256:${sha256(canonicalPayload)}`;
  const canonicalReceiptHash = readString(receipt, ["hashes", "canonicalReceiptHash"]);
  const signerKeyId = readString(receipt, ["signer", "keyId"]);
  const signerAlgorithm = readString(receipt, ["signer", "algorithm"]);
  const signature = readString(receipt, ["signature"]);
  const verification = verifyRunnerSignature({
    canonicalPayload,
    canonicalReceiptHash,
    computedCanonicalReceiptHash,
    signerKeyId,
    signerAlgorithm,
    signature
  });
  const bindingErrors = validateRunnerReceiptBinding(receipt, expected);
  const signatureState = bindingErrors.length ? "invalid" : verification.state;
  const signatureError = [verification.error, ...bindingErrors].filter(Boolean).join("; ") || null;

  return {
    runnerReceiptVersion: readNumber(receipt, ["runnerReceiptVersion"]),
    jobId: readString(receipt, ["jobId"]),
    routeId: readString(receipt, ["routeId"]),
    providerId: readString(receipt, ["providerId"]),
    runnerId: readString(receipt, ["runnerId"]),
    status: readString(receipt, ["status"]),
    canonicalReceiptHash,
    computedCanonicalReceiptHash,
    signerKeyId,
    signerAlgorithm,
    signatureState,
    signatureError
  };
}

function validateRunnerReceiptBinding(receipt: Record<string, unknown>, expected?: RunnerReceiptValidationContext) {
  if (!expected) {
    return [];
  }

  const errors: string[] = [];
  compareString(errors, "routeId", readString(receipt, ["routeId"]), expected.routeId);
  compareString(errors, "providerId", readString(receipt, ["providerId"]), expected.providerId);
  compareString(errors, "idempotencyKey", readString(receipt, ["idempotencyKey"]), expected.idempotencyKey);
  compareString(errors, "status", readString(receipt, ["status"]), expected.status);
  compareString(errors, "model", readString(receipt, ["model"]), expected.model);
  compareString(errors, "requestHash", readString(receipt, ["hashes", "requestHash"]), expected.requestHash);
  compareString(errors, "outputHash", readString(receipt, ["hashes", "outputHash"]), expected.outputHash);
  compareNumber(errors, "usage.inputTokens", readNumber(receipt, ["usage", "inputTokens"]), expected.promptTokens);
  compareNumber(errors, "usage.outputTokens", readNumber(receipt, ["usage", "outputTokens"]), expected.completionTokens);
  compareNumber(errors, "costUsd", readFirstNumber(receipt, [["costUsd"], ["usage", "costUsd"], ["billing", "costUsd"]]), expected.providerCostUsd);

  const claimedCostUsd = readFirstNumber(receipt, [["costUsd"], ["usage", "costUsd"], ["billing", "costUsd"]]);
  if (claimedCostUsd !== null && expected.maxBudgetUsd !== undefined && expected.maxBudgetUsd !== null && claimedCostUsd > expected.maxBudgetUsd) {
    errors.push("receipt_context_mismatch:maxBudgetUsd");
  }

  return errors;
}

function compareString(errors: string[], field: string, actual: string | null, expected: string | null | undefined) {
  if (expected !== undefined && expected !== null && actual !== expected) {
    errors.push(`receipt_context_mismatch:${field}`);
  }
}

function compareNumber(errors: string[], field: string, actual: number | null, expected: number | null | undefined) {
  if (expected !== undefined && expected !== null && actual !== null && actual !== expected) {
    errors.push(`receipt_context_mismatch:${field}`);
  }
}

function readFirstNumber(payload: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = readNumber(payload, path);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function verifyRunnerSignature(input: {
  canonicalPayload: string;
  canonicalReceiptHash: string | null;
  computedCanonicalReceiptHash: string;
  signerKeyId: string | null;
  signerAlgorithm: string | null;
  signature: string | null;
}): { state: RunnerReceiptSummary["signatureState"]; error: string | null } {
  if (!input.canonicalReceiptHash) {
    return { state: "invalid", error: "canonical_receipt_hash_missing" };
  }
  if (input.canonicalReceiptHash !== input.computedCanonicalReceiptHash) {
    return { state: "invalid", error: "canonical_receipt_hash_mismatch" };
  }
  if (input.signerAlgorithm === "none" || (!input.signerKeyId && !input.signature)) {
    return { state: "unsigned", error: null };
  }
  if (input.signerAlgorithm !== "ed25519") {
    return { state: "invalid", error: "unsupported_signature_algorithm" };
  }
  if (!input.signerKeyId || !input.signature) {
    return { state: "missing", error: "signature_missing" };
  }

  const publicKeyPem = trustedRunnerPublicKey(input.signerKeyId);
  if (!publicKeyPem) {
    return { state: "invalid", error: "trusted_runner_public_key_not_configured" };
  }

  try {
    const publicKey = createPublicKey(publicKeyPem);
    const valid = verify(null, Buffer.from(input.canonicalPayload), publicKey, Buffer.from(input.signature, "base64"));
    return valid ? { state: "verified", error: null } : { state: "invalid", error: "signature_invalid" };
  } catch {
    return { state: "invalid", error: "signature_verification_error" };
  }
}

function trustedRunnerPublicKey(keyId: string) {
  return collectTrustedRunnerKeys().find((key) => key.keyId === keyId)?.publicKeyPem ?? null;
}

function collectTrustedRunnerKeys(): TrustedRunnerKey[] {
  return [
    ...trustedKeysFromJson(cleanEnv(process.env.FISH_RUNNER_PUBLIC_KEYS_JSON)),
    ...trustedKeysFromPath(cleanEnv(process.env.FISH_RUNNER_PUBLIC_KEYS_PATH)),
    ...trustedKeyFromSingleEnv()
  ];
}

function trustedKeysFromPath(filePath: string | null): TrustedRunnerKey[] {
  if (!filePath) {
    return [];
  }
  try {
    return trustedKeysFromJson(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function trustedKeyFromSingleEnv(): TrustedRunnerKey[] {
  const keyId = cleanEnv(process.env.FISH_RUNNER_PUBLIC_KEY_ID);
  const publicKeyPem = normalizePem(cleanEnv(process.env.FISH_RUNNER_PUBLIC_KEY_PEM));
  return keyId && publicKeyPem ? [{ keyId, publicKeyPem }] : [];
}

function trustedKeysFromJson(value: string | null): TrustedRunnerKey[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }
        const keyId = readString(entry, ["keyId"]);
        const publicKeyPem = normalizePem(readString(entry, ["publicKeyPem"]));
        return keyId && publicKeyPem ? [{ keyId, publicKeyPem }] : [];
      });
    }
    if (isRecord(parsed)) {
      return Object.entries(parsed).flatMap(([keyId, publicKeyValue]) => {
        const publicKeyPem = normalizePem(typeof publicKeyValue === "string" ? publicKeyValue : null);
        return keyId && publicKeyPem ? [{ keyId, publicKeyPem }] : [];
      });
    }
  } catch {
    return [];
  }
  return [];
}

function canonicalRunnerReceiptPayload(receipt: Record<string, unknown>) {
  const clone = deepClone(receipt);
  delete clone.signature;
  delete clone.signer;
  if (isRecord(clone.hashes)) {
    const hashes = { ...clone.hashes };
    delete hashes.canonicalReceiptHash;
    clone.hashes = hashes;
  }
  return stableStringify(clone);
}

function deepClone(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function readNumber(payload: unknown, path: string[]) {
  const value = readPath(payload, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(payload: unknown, path: string[]) {
  const value = readPath(payload, path);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function normalizePem(value: string | null) {
  return value?.replaceAll("\\n", "\n") ?? null;
}

function cleanEnv(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
