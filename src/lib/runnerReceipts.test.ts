import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, test } from "node:test";
import { readAndVerifyRunnerReceipt, runnerReceiptSha256 } from "./runnerReceipts";

const RUNNER_KEY_ENV = ["FISH_RUNNER_PUBLIC_KEYS_JSON", "FISH_RUNNER_PUBLIC_KEYS_PATH", "FISH_RUNNER_PUBLIC_KEY_ID", "FISH_RUNNER_PUBLIC_KEY_PEM"] as const;

afterEach(() => {
  clearRunnerKeyEnv();
});

test("runner receipt validation marks stale receipts invalid when route context differs", () => {
  const receipt = buildUnsignedReceipt({
    routeId: "external-fallback",
    providerId: "old-provider",
    idempotencyKey: "old-request",
    status: "failed",
    model: "old-model",
    requestHash: runnerReceiptSha256(JSON.stringify([{ role: "user", content: "old prompt" }])),
    outputHash: runnerReceiptSha256("old output"),
    inputTokens: 7,
    outputTokens: 3
  });

  const summary = readAndVerifyRunnerReceipt(
    { fish_runner: receipt },
    {
      routeId: "ocean-provider",
      providerId: "selected-ocean-provider",
      idempotencyKey: "current-request",
      status: "succeeded",
      model: "current-model",
      requestHash: runnerReceiptSha256(JSON.stringify([{ role: "user", content: "current prompt" }])),
      outputHash: runnerReceiptSha256("current output"),
      promptTokens: 11,
      completionTokens: 5
    }
  );

  assert.equal(summary?.signatureState, "invalid");
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:routeId/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:providerId/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:idempotencyKey/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:requestHash/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:outputHash/);
});

test("runner receipt validation keeps a context-bound unsigned receipt unsigned", () => {
  const messages = [{ role: "user", content: "hello fish" }];
  const output = "hello ocean";
  const receipt = buildUnsignedReceipt({
    routeId: "ocean-provider",
    providerId: "selected-ocean-provider",
    idempotencyKey: "current-request",
    status: "succeeded",
    model: "current-model",
    requestHash: runnerReceiptSha256(JSON.stringify(messages)),
    outputHash: runnerReceiptSha256(output),
    inputTokens: 9,
    outputTokens: 4
  });

  const summary = readAndVerifyRunnerReceipt(
    { fish_runner: receipt },
    {
      routeId: "ocean-provider",
      providerId: "selected-ocean-provider",
      idempotencyKey: "current-request",
      status: "succeeded",
      model: "current-model",
      requestHash: runnerReceiptSha256(JSON.stringify(messages)),
      outputHash: runnerReceiptSha256(output),
      promptTokens: 9,
      completionTokens: 4
    }
  );

  assert.equal(summary?.signatureState, "unsigned");
  assert.equal(summary?.signatureError, null);
});

test("runner receipts with an untrusted signer are not treated as signed proof", () => {
  clearRunnerKeyEnv();
  const receipt = buildSignedReceipt({ keyId: "unknown-runner-key", signature: "definitely-not-valid" });

  const summary = readAndVerifyRunnerReceipt({ fish_runner: receipt });

  assert.equal(summary?.signatureState, "invalid");
  assert.equal(summary?.signatureError, "trusted_runner_public_key_not_configured");
  assert.equal(summary?.canonicalReceiptHash, summary?.computedCanonicalReceiptHash);
});

test("runner receipts are verified only with a trusted Ed25519 signer key", () => {
  clearRunnerKeyEnv();
  const keyId = "trusted-runner-key";
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  process.env.FISH_RUNNER_PUBLIC_KEY_ID = keyId;
  process.env.FISH_RUNNER_PUBLIC_KEY_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

  const unsignedReceipt = buildSignedReceipt({ keyId });
  const signature = sign(null, Buffer.from(canonicalRunnerReceiptPayload(unsignedReceipt)), privateKey).toString("base64");
  const signedReceipt = { ...unsignedReceipt, signature };

  const summary = readAndVerifyRunnerReceipt({ fish_runner: signedReceipt });

  assert.equal(summary?.signatureState, "verified");
  assert.equal(summary?.signatureError, null);
  assert.equal(summary?.signerKeyId, keyId);
});

function buildUnsignedReceipt(input: {
  routeId: string;
  providerId: string;
  idempotencyKey: string;
  status: string;
  model: string;
  requestHash: string;
  outputHash: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const unsignedReceipt = {
    runnerReceiptVersion: 1,
    jobId: "job_test",
    routeId: input.routeId,
    idempotencyKey: input.idempotencyKey,
    providerId: input.providerId,
    runnerId: "runner_test",
    model: input.model,
    engine: "vllm",
    status: input.status,
    startedAt: "2026-06-05T00:00:00.000Z",
    completedAt: "2026-06-05T00:00:01.000Z",
    usage: {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      gpuSeconds: 1
    },
    timing: {
      firstTokenMs: 50,
      totalMs: 1000
    },
    hashes: {
      requestHash: input.requestHash,
      outputHash: input.outputHash
    }
  };
  return {
    ...unsignedReceipt,
    hashes: {
      ...unsignedReceipt.hashes,
      canonicalReceiptHash: runnerReceiptSha256(stableStringify(unsignedReceipt))
    },
    signer: {
      keyId: null,
      algorithm: "none"
    },
    signature: null
  };
}

function buildSignedReceipt({ keyId, signature }: { keyId: string; signature?: string }) {
  const receipt = {
    runnerReceiptVersion: 1,
    jobId: "job-test",
    routeId: "ocean-demo-vllm",
    providerId: "provider-test",
    runnerId: "runner-test",
    status: "succeeded",
    usage: {
      promptTokens: 4,
      completionTokens: 8,
      totalTokens: 12
    },
    hashes: {
      inputHash: "sha256:input",
      outputHash: "sha256:output"
    },
    signer: {
      keyId,
      algorithm: "ed25519"
    },
    ...(signature ? { signature } : {})
  };
  return {
    ...receipt,
    hashes: {
      ...receipt.hashes,
      canonicalReceiptHash: `sha256:${sha256(canonicalRunnerReceiptPayload(receipt))}`
    }
  };
}

function canonicalRunnerReceiptPayload(receipt: Record<string, unknown>) {
  const clone = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
  delete clone.signature;
  delete clone.signer;
  if (clone.hashes && typeof clone.hashes === "object" && !Array.isArray(clone.hashes)) {
    const hashes = { ...(clone.hashes as Record<string, unknown>) };
    delete hashes.canonicalReceiptHash;
    clone.hashes = hashes;
  }
  return stableStringify(clone);
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

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function clearRunnerKeyEnv() {
  for (const key of RUNNER_KEY_ENV) {
    delete process.env[key];
  }
}
