import assert from "node:assert/strict";
import { test } from "node:test";
import { runOceanBatchJob } from "./oceanBatch";
import type { Account, Ledger } from "./fishLedger";

test("live Ocean batch adapter requires an Ocean-eligible plan", async () => {
  const { account, ledger } = testLedger({ planId: "free", creditBalance: 100000 });

  const result = await runOceanBatchJob(
    {
      taskType: "document_summary",
      inputRef: "sha256:free-plan-live-batch-test",
      estimatedInputTokens: 1,
      maxOutputTokens: 1,
      maxRuntimeSeconds: 60,
      maxCostUsd: 100,
      adapterMode: "ocean_http"
    },
    { account, ledger }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error, "ocean_batch_live_adapter_not_allowed_for_plan");
});

test("live Ocean batch reservation covers the caller-selected provider cost cap", async () => {
  const { account, ledger } = testLedger({ planId: "team-api", creditBalance: 1 });

  const result = await runOceanBatchJob(
    {
      taskType: "document_summary",
      inputRef: "sha256:cost-cap-reserve-test",
      estimatedInputTokens: 1,
      maxOutputTokens: 1,
      maxRuntimeSeconds: 60,
      maxCostUsd: 0.1,
      adapterMode: "ocean_http"
    },
    { account, ledger }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 402);
  assert.equal(result.error, "insufficient_fish_credits");
  if (!result.ok && "needed" in result) {
    assert.equal(result.needed, 100);
    assert.equal(result.available, 1);
  }
});

function testLedger({ planId, creditBalance }: { planId: Account["planId"]; creditBalance: number }) {
  const account: Account = {
    id: `acct_${planId}`,
    label: "Test account",
    keyHash: "test-key-hash",
    createdAt: "2026-06-05T00:00:00.000Z",
    rotatedAt: null,
    revokedAt: null,
    planId,
    planActivatedAt: null,
    planExpiresAt: null,
    planSource: "pilot_key",
    creditBalance,
    totalCreditsGranted: creditBalance,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null
  };
  const ledger: Ledger = { accounts: [account] };
  return { account, ledger };
}
