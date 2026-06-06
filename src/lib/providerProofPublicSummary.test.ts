import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import type { ProviderJobReceipt } from "./providerJobs";

const originalCwd = process.cwd();
let activeTempDir: string | null = null;

afterEach(async () => {
  process.chdir(originalCwd);
  if (activeTempDir) {
    await rm(activeTempDir, { recursive: true, force: true });
    activeTempDir = null;
  }
});

test("proof summary returns public receipt rows and provider CSV neutralizes formulas", async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-proof-summary-"));
  process.chdir(activeTempDir);
  const receiptsDir = path.join(activeTempDir, "data", "proof", "receipts");
  await mkdir(receiptsDir, { recursive: true });
  await writeFile(path.join(receiptsDir, "receipt.json"), JSON.stringify(buildReceipt(), null, 2));

  const { exportProviderJobReceiptsCsv, summarizeProof } = await import(`./providerJobs.ts?public=${Date.now()}`);
  const summary = await summarizeProof();
  const receipt = summary.receipts[0] as Record<string, unknown>;
  const csv = await exportProviderJobReceiptsCsv({ limit: 10 });

  assert.equal(summary.receipts.length, 1);
  assert.equal(receipt.providerLabel, "=Formula Provider");
  assert.equal(receipt.canonicalReceiptHash, `sha256:${"c".repeat(64)}`);
  assert.equal(receipt.hashes, undefined);
  assert.equal(receipt.usage, undefined);
  assert.equal(receipt.cost, undefined);
  assert.match(csv, /"'=Formula Provider"/);
});

function buildReceipt(): ProviderJobReceipt {
  return {
    receiptVersion: 1,
    receiptType: "provider_job_receipt",
    receiptId: "receipt_public_summary_001",
    jobId: "job_public_summary_001",
    providerJobId: "provider_job_public_summary_001",
    providerId: "provider_public_summary",
    providerLabel: "=Formula Provider",
    model: "fish-demo-chat",
    workloadType: "chat_batch",
    backend: "ocean_provider",
    status: "succeeded",
    sourceState: "snapshot",
    visibility: "public",
    createdAt: "2026-06-05T00:00:00.000Z",
    startedAt: "2026-06-05T00:00:00.000Z",
    completedAt: "2026-06-05T00:00:01.000Z",
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      gpuSeconds: 2
    },
    cost: {
      userChargeUsd: 0.03,
      providerCostUsd: 0.02,
      pricingState: "provider_verified"
    },
    hashes: {
      inputHash: `sha256:${"a".repeat(64)}`,
      outputHash: `sha256:${"b".repeat(64)}`,
      canonicalReceiptHash: `sha256:${"c".repeat(64)}`
    },
    signer: {
      keyId: "fish-proof-none-v1",
      algorithm: "none",
      publicKeyPem: null
    },
    signatureStatus: "not_required",
    signature: null,
    errorCode: null
  };
}
