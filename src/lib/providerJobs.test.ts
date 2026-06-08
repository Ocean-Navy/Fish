import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, test } from "node:test";
import { effectiveProviderReceiptSourceState, validateProviderJobEndpoint, verifyProviderJobReceipt, type ProviderJobReceipt } from "./providerJobs";

const PROVIDER_PROOF_ENV_KEYS = [
  "FISH_PROVIDER_PROOF_PUBLIC_KEY_ID",
  "FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM",
  "FISH_PROVIDER_PROOF_PUBLIC_KEYS_JSON",
  "FISH_PROVIDER_PROOF_PUBLIC_KEYS_PATH",
  "FISH_PROVIDER_PROOF_SIGNING_KEY_ID",
  "FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM"
] as const;

afterEach(() => {
  clearProviderProofEnv();
});

test("provider job endpoint validation accepts public HTTP(S) endpoints", async () => {
  assert.deepEqual(await validateProviderJobEndpoint("https://8.8.8.8/fish/jobs"), { ok: true, url: "https://8.8.8.8/fish/jobs" });
  assert.deepEqual(await validateProviderJobEndpoint("http://[2001:4860:4860::8888]/fish/jobs"), { ok: true, url: "http://[2001:4860:4860::8888]/fish/jobs" });
});

test("provider job endpoint validation rejects local and private destinations", async () => {
  const blocked = [
    "http://localhost/fish/jobs",
    "http://127.0.0.1/fish/jobs",
    "http://10.0.0.1/fish/jobs",
    "http://172.16.0.10/fish/jobs",
    "http://192.168.1.10/fish/jobs",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/fish/jobs",
    "http://[fc00::1]/fish/jobs",
    "http://[fe80::1]/fish/jobs",
    "http://[::ffff:127.0.0.1]/fish/jobs",
    "http://[::127.0.0.1]/fish/jobs"
  ];

  for (const endpoint of blocked) {
    assert.deepEqual(await validateProviderJobEndpoint(endpoint), { ok: false, errorCode: "provider_job_endpoint_private" }, endpoint);
  }
});

test("provider job endpoint validation rejects unsupported schemes and credentialed URLs", async () => {
  assert.deepEqual(await validateProviderJobEndpoint("file:///etc/passwd"), { ok: false, errorCode: "provider_job_endpoint_invalid_scheme" });
  assert.deepEqual(await validateProviderJobEndpoint("https://fish:secret@8.8.8.8/fish/jobs"), { ok: false, errorCode: "provider_job_endpoint_invalid_auth" });
});

test("provider receipt verification rejects self-signed receipt keys", () => {
  clearProviderProofEnv();
  const attackerKey = generateProofKey("attacker-key");
  const forgedReceipt = signReceipt(buildReceipt({ signerKeyId: attackerKey.keyId, signerPublicKeyPem: attackerKey.publicKeyPem }), attackerKey.privateKeyPem);

  const verification = verifyProviderJobReceipt(forgedReceipt);

  assert.equal(verification.ok, false);
  assert.equal(verification.error, "trusted_provider_proof_public_key_not_configured");
});

test("provider receipt verification rejects unsigned opt-out receipts", () => {
  clearProviderProofEnv();
  const unsignedReceipt = buildReceipt({ signerKeyId: "fish-proof-none-v1", signerAlgorithm: "none", signerPublicKeyPem: null, signatureStatus: "not_required" });
  unsignedReceipt.hashes.canonicalReceiptHash = hashReceiptForTest(unsignedReceipt);

  const verification = verifyProviderJobReceipt(unsignedReceipt);

  assert.equal(verification.ok, false);
  assert.equal(verification.error, "signature_not_required_untrusted");
});

test("provider receipt verification accepts signatures from configured trusted keys", () => {
  clearProviderProofEnv();
  const trustedKey = generateProofKey("trusted-provider-proof-key");
  process.env.FISH_PROVIDER_PROOF_PUBLIC_KEY_ID = trustedKey.keyId;
  process.env.FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM = trustedKey.publicKeyPem;
  const receipt = signReceipt(buildReceipt({ signerKeyId: trustedKey.keyId, signerPublicKeyPem: trustedKey.publicKeyPem }), trustedKey.privateKeyPem);

  const verification = verifyProviderJobReceipt(receipt);

  assert.equal(verification.ok, true);
  assert.equal(verification.error, null);
});

test("provider proof source labels do not promote mock or rejected rows", () => {
  const mockReceipt = buildReceipt({
    signerKeyId: "test",
    signerPublicKeyPem: null,
    providerJobId: "mock_123",
    sourceState: "live"
  });
  const notAllowedReceipt = buildReceipt({
    signerKeyId: "test",
    signerPublicKeyPem: null,
    providerJobId: null,
    sourceState: "live",
    status: "not_allowed"
  });
  const providerReceipt = buildReceipt({
    signerKeyId: "test",
    signerPublicKeyPem: null,
    providerJobId: "provider_job_123",
    sourceState: "snapshot"
  });

  assert.equal(effectiveProviderReceiptSourceState(mockReceipt), "sample");
  assert.equal(effectiveProviderReceiptSourceState(notAllowedReceipt), "sample");
  assert.equal(effectiveProviderReceiptSourceState(providerReceipt), "snapshot");
});

test("provider receipt verification trusts configured signing private key", () => {
  clearProviderProofEnv();
  const trustedKey = generateProofKey("managed-provider-proof-key");
  process.env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID = trustedKey.keyId;
  process.env.FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM = trustedKey.privateKeyPem;
  const receipt = signReceipt(buildReceipt({ signerKeyId: trustedKey.keyId, signerPublicKeyPem: trustedKey.publicKeyPem }), trustedKey.privateKeyPem);

  const verification = verifyProviderJobReceipt(receipt);

  assert.equal(verification.ok, true);
  assert.equal(verification.error, null);
});

test("provider receipt verification accepts env PEMs with double-escaped newlines", () => {
  clearProviderProofEnv();
  const trustedKey = generateProofKey("managed-provider-proof-key");
  process.env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID = trustedKey.keyId;
  process.env.FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM = trustedKey.privateKeyPem.replaceAll("\n", "\\\\n");
  const receipt = signReceipt(buildReceipt({ signerKeyId: trustedKey.keyId, signerPublicKeyPem: trustedKey.publicKeyPem }), trustedKey.privateKeyPem);

  const verification = verifyProviderJobReceipt(receipt);

  assert.equal(verification.ok, true);
  assert.equal(verification.error, null);
});

function generateProofKey(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
}

function buildReceipt({
  signerKeyId,
  signerAlgorithm = "ed25519",
  signerPublicKeyPem,
  signatureStatus = "valid",
  providerJobId = "provider_job_test_001",
  sourceState = "snapshot",
  status = "succeeded"
}: {
  signerKeyId: string;
  signerAlgorithm?: ProviderJobReceipt["signer"]["algorithm"];
  signerPublicKeyPem: string | null;
  signatureStatus?: ProviderJobReceipt["signatureStatus"];
  providerJobId?: ProviderJobReceipt["providerJobId"];
  sourceState?: ProviderJobReceipt["sourceState"];
  status?: ProviderJobReceipt["status"];
}): ProviderJobReceipt {
  return {
    receiptVersion: 1,
    receiptType: "provider_job_receipt",
    receiptId: "receipt_test_001",
    jobId: "job_test_001",
    providerJobId,
    providerId: "provider_test",
    providerLabel: "Test Provider",
    model: "fish-demo-chat",
    workloadType: "chat_batch",
    backend: "ocean_provider",
    status,
    sourceState,
    visibility: "public",
    createdAt: "2026-06-05T00:00:00.000Z",
    startedAt: "2026-06-05T00:00:00.000Z",
    completedAt: "2026-06-05T00:00:01.000Z",
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      gpuSeconds: 1
    },
    cost: {
      userChargeUsd: 0.01,
      providerCostUsd: 0.008,
      pricingState: "provider_verified"
    },
    hashes: {
      inputHash: normalizeHashForTest("input"),
      outputHash: normalizeHashForTest("output"),
      canonicalReceiptHash: ""
    },
    signer: {
      keyId: signerKeyId,
      algorithm: signerAlgorithm,
      publicKeyPem: signerPublicKeyPem
    },
    signatureStatus,
    signature: null,
    errorCode: null
  };
}

function signReceipt(receipt: ProviderJobReceipt, privateKeyPem: string) {
  const canonicalReceiptHash = hashReceiptForTest(receipt);
  return {
    ...receipt,
    hashes: {
      ...receipt.hashes,
      canonicalReceiptHash
    },
    signature: sign(null, Buffer.from(canonicalReceiptHash), privateKeyPem).toString("base64")
  };
}

function hashReceiptForTest(receipt: ProviderJobReceipt): string {
  const { signature: _signature, ...withoutSignature } = receipt;
  return normalizeHashForTest(
    stableStringify({
      ...withoutSignature,
      hashes: {
        inputHash: receipt.hashes.inputHash,
        outputHash: receipt.hashes.outputHash,
        canonicalReceiptHash: ""
      }
    })
  );
}

function normalizeHashForTest(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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

function clearProviderProofEnv() {
  for (const key of PROVIDER_PROOF_ENV_KEYS) {
    delete process.env[key];
  }
}
