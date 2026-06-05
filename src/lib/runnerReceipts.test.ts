import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, test } from "node:test";
import { readAndVerifyRunnerReceipt } from "./runnerReceipts";

const RUNNER_KEY_ENV_KEYS = [
  "FISH_RUNNER_PUBLIC_KEYS_JSON",
  "FISH_RUNNER_PUBLIC_KEYS_PATH",
  "FISH_RUNNER_PUBLIC_KEY_ID",
  "FISH_RUNNER_PUBLIC_KEY_PEM"
] as const;

afterEach(() => {
  clearRunnerKeyEnv();
});

test("runner receipts with untrusted non-empty signatures are invalid, not signed proof", () => {
  clearRunnerKeyEnv();
  const receipt = signedReceipt({ keyId: "untrusted-runner-key" });

  const summary = readAndVerifyRunnerReceipt({ fish_runner: receipt }, {
    expectedRouteId: "ocean-demo-vllm",
    expectedProviderId: "selected-provider",
    expectedStatus: "succeeded"
  });

  assert.equal(summary?.signatureState, "invalid");
  assert.equal(summary?.signatureError, "trusted_runner_public_key_not_configured");
});

test("runner receipts must match the Fish route and provider before they are verified", () => {
  clearRunnerKeyEnv();
  const receipt = signedReceipt({ keyId: "trusted-runner-key" });

  const summary = readAndVerifyRunnerReceipt({ fish_runner: receipt }, {
    expectedRouteId: "different-route",
    expectedProviderId: "selected-provider",
    expectedStatus: "succeeded"
  });

  assert.equal(summary?.signatureState, "invalid");
  assert.equal(summary?.signatureError, "route_id_mismatch");
});

test("runner receipts with a matching trusted Ed25519 signature are verified", () => {
  clearRunnerKeyEnv();
  const receipt = signedReceipt({ keyId: "trusted-runner-key" });

  const summary = readAndVerifyRunnerReceipt({ fish_runner: receipt }, {
    expectedRouteId: "ocean-demo-vllm",
    expectedProviderId: "selected-provider",
    expectedStatus: "succeeded"
  });

  assert.equal(summary?.signatureState, "verified");
  assert.equal(summary?.signatureError, null);
});

function signedReceipt({ keyId }: { keyId: string }) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  process.env.FISH_RUNNER_PUBLIC_KEY_ID = keyId === "trusted-runner-key" ? keyId : "different-trusted-key";
  process.env.FISH_RUNNER_PUBLIC_KEY_PEM = publicKeyPem;

  const receipt = {
    runnerReceiptVersion: 1,
    jobId: "job-test-001",
    routeId: "ocean-demo-vllm",
    providerId: "selected-provider",
    runnerId: "runner-001",
    model: "small-chat",
    engine: "vllm",
    status: "succeeded",
    hashes: {
      requestHash: "sha256:request",
      outputHash: "sha256:output"
    },
    signer: {
      keyId,
      algorithm: "ed25519"
    }
  };
  const canonicalPayload = canonicalRunnerReceiptPayload(receipt);
  const canonicalReceiptHash = `sha256:${createHash("sha256").update(canonicalPayload).digest("hex")}`;
  const signature = sign(null, Buffer.from(canonicalPayload), privateKey).toString("base64");

  return {
    ...receipt,
    hashes: {
      ...receipt.hashes,
      canonicalReceiptHash
    },
    signature
  };
}

function canonicalRunnerReceiptPayload(receipt: Record<string, unknown>) {
  const clone = JSON.parse(JSON.stringify(receipt));
  delete clone.signature;
  delete clone.signer;
  if (clone.hashes && typeof clone.hashes === "object" && !Array.isArray(clone.hashes)) {
    delete clone.hashes.canonicalReceiptHash;
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

function clearRunnerKeyEnv() {
  for (const key of RUNNER_KEY_ENV_KEYS) {
    delete process.env[key];
  }
}
