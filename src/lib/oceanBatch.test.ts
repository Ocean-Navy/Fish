import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { parseOceanBatchJobRequest, runOceanBatchJob } from "./oceanBatch";
import { createApiKey, type Account, type Ledger } from "./fishLedger";

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

test("Ocean batch payload estimates cannot be under-reported", () => {
  const parsed = parseOceanBatchJobRequest({
    taskType: "document_summary",
    inputRef: "sha256:payload-estimate-parse-test",
    inputPayload: "x".repeat(4000),
    estimatedInputTokens: 1,
    maxOutputTokens: 1,
    maxRuntimeSeconds: 60,
    maxCostUsd: 1,
    adapterMode: "sample_success"
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.flatten().fieldErrors.estimatedInputTokens?.[0] ?? "", /estimatedInputTokens must be at least/);
  }
});

test("Ocean batch credit reservation includes private payload tokens", async () => {
  const { account, ledger } = testLedger({ planId: "free", creditBalance: 1 });

  const result = await runOceanBatchJob(
    {
      taskType: "document_summary",
      inputRef: "sha256:payload-reserve-test",
      inputPayload: "x".repeat(4000),
      maxOutputTokens: 1,
      maxRuntimeSeconds: 60,
      maxCostUsd: 1,
      adapterMode: "sample_success"
    },
    { account, ledger }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 402);
  assert.equal(result.error, "insufficient_fish_credits");
  if (!result.ok && "needed" in result) {
    assert.equal(result.needed, 2);
    assert.equal(result.available, 1);
  }
});

test("failed provider-cost Ocean batch receipts do not consume daily budget", async () => {
  await rm(path.join(process.cwd(), "data", "ocean-batch"), { recursive: true, force: true });

  const previousEndpoint = process.env.FISH_OCEAN_BATCH_ENDPOINT;
  const previousBudget = process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD;
  let backendHits = 0;
  const server = createServer((request, response) => {
    request.resume();
    backendHits += 1;
    response.setHeader("content-type", "application/json");
    if (backendHits === 1) {
      response.end(
        JSON.stringify({
          status: "failed",
          errorCode: "provider_failed_after_cost",
          cost: { providerCostUsd: 0.06, currency: "USD" },
          usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10, gpuSeconds: 1, items: 1 }
        })
      );
      return;
    }

    response.end(
      JSON.stringify({
        status: "succeeded",
        providerJobId: "provider-success-after-failure",
        outputRef: "sha256:provider-success-after-failure-output",
        cost: { providerCostUsd: 0.05, currency: "USD" },
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, gpuSeconds: 2, items: 1 }
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  const port = (address as AddressInfo).port;

  try {
    process.env.FISH_OCEAN_BATCH_ENDPOINT = `http://127.0.0.1:${port}`;
    process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD = "0.10";

    const created = await createApiKey("Ocean batch budget test", 100000, "team-api");
    const account = created.account as unknown as Account;
    const ledger: Ledger = { accounts: [account] };
    const failed = await runOceanBatchJob(
      {
        taskType: "document_summary",
        inputRef: "sha256:failed-provider-cost-budget-test",
        estimatedInputTokens: 10,
        maxOutputTokens: 20,
        maxRuntimeSeconds: 60,
        maxCostUsd: 0.06,
        adapterMode: "ocean_http"
      },
      { account, ledger }
    );

    assert.equal(failed.ok, false);
    assert.equal(failed.status, 502);
    assert.equal("receipt" in failed, true);
    if (!failed.ok && "receipt" in failed) {
      const receipt = failed.receipt;
      assert.ok(receipt);
      assert.equal(receipt.status, "failed");
      assert.equal(receipt.cost.providerCostUsd, 0.06);
      assert.equal(receipt.cost.pricingState, "provider_verified");
    }
    assert.equal(account.creditBalance, 100000);

    const succeeded = await runOceanBatchJob(
      {
        taskType: "document_summary",
        inputRef: "sha256:succeeded-provider-budget-test",
        estimatedInputTokens: 10,
        maxOutputTokens: 20,
        maxRuntimeSeconds: 60,
        maxCostUsd: 0.05,
        adapterMode: "ocean_http"
      },
      { account, ledger }
    );

    assert.equal(succeeded.ok, true);
    assert.equal(succeeded.status, 200);
    assert.equal(backendHits, 2);
    if (succeeded.ok) {
      assert.equal(succeeded.budget.spentUsd, 0.05);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (previousEndpoint === undefined) {
      delete process.env.FISH_OCEAN_BATCH_ENDPOINT;
    } else {
      process.env.FISH_OCEAN_BATCH_ENDPOINT = previousEndpoint;
    }
    if (previousBudget === undefined) {
      delete process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD;
    } else {
      process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD = previousBudget;
    }
    await rm(path.join(process.cwd(), "data", "ocean-batch"), { recursive: true, force: true });
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
