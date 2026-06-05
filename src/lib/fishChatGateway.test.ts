import assert from "node:assert/strict";
import { test } from "node:test";
import { runFishChatGateway } from "./fishChatGateway";
import type { Account, Ledger } from "./fishLedger";

test("Ocean helper rejects oversized prompts before quota or credit mutations", async () => {
  const account: Account = {
    id: "security-test-account",
    label: "Security test account",
    keyHash: "test-key-hash",
    createdAt: new Date(0).toISOString(),
    planId: "free",
    creditBalance: 25,
    totalCreditsGranted: 25,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null
  };
  const ledger: Ledger = { accounts: [account] };

  const result = await runFishChatGateway(
    {
      model: "fish-ocean-helper",
      messages: [{ role: "user", content: "x".repeat(12000) }],
      stream: false
    },
    {
      ledger,
      account,
      principalId: "security-test-principal",
      dailyQuotaLimit: 1,
      allowExternalFallback: false
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal((result.body.error as { message?: string }).message, "max_input_tokens_exceeded");
  assert.equal(account.creditBalance, 25);
  assert.equal(account.requestCount, 0);
});
