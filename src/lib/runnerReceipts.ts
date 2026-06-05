import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RunnerReceiptSummary } from "@/lib/fishLedger";

type TrustedRunnerKey = {
  keyId: string;
  publicKeyPem: string;
};

export type RunnerReceiptVerificationContext = {
  expectedRouteId?: string | null;
  expectedProviderId?: string | null;
  expectedStatus?: string | null;
};

export function readAndVerifyRunnerReceipt(payload: unknown, context: RunnerReceiptVerificationContext = {}): RunnerReceiptSummary | null {
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
  const routeId = readString(receipt, ["routeId"]);
  const providerId = readString(receipt, ["providerId"]);
  const status = readString(receipt, ["status"]);
  const verification = verifyRunnerSignature({
    canonicalPayload,
    canonicalReceiptHash,
    computedCanonicalReceiptHash,
    signerKeyId,
    signerAlgorithm,
    signature
  });
  const matchedVerification = verifyRunnerReceiptContext({
    verification,
    receipt: { routeId, providerId, status },
    context
  });

  return {
    runnerReceiptVersion: readNumber(receipt, ["runnerReceiptVersion"]),
    jobId: readString(receipt, ["jobId"]),
    routeId,
    providerId,
    runnerId: readString(receipt, ["runnerId"]),
    status,
    canonicalReceiptHash,
    computedCanonicalReceiptHash,
    signerKeyId,
    signerAlgorithm,
    signatureState: matchedVerification.state,
    signatureError: matchedVerification.error
  };
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

function verifyRunnerReceiptContext(input: {
  verification: { state: RunnerReceiptSummary["signatureState"]; error: string | null };
  receipt: { routeId: string | null; providerId: string | null; status: string | null };
  context: RunnerReceiptVerificationContext;
}): { state: RunnerReceiptSummary["signatureState"]; error: string | null } {
  const expectedRouteId = cleanNullable(input.context.expectedRouteId);
  if (expectedRouteId && input.receipt.routeId !== expectedRouteId) {
    return { state: "invalid", error: "route_id_mismatch" };
  }

  const expectedProviderId = cleanNullable(input.context.expectedProviderId);
  if (expectedProviderId && input.receipt.providerId !== expectedProviderId) {
    return { state: "invalid", error: "provider_id_mismatch" };
  }

  const expectedStatus = cleanNullable(input.context.expectedStatus);
  if (expectedStatus && input.receipt.status !== expectedStatus) {
    return { state: "invalid", error: "status_mismatch" };
  }

  return input.verification;
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
  return cleanNullable(value);
}

function cleanNullable(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
