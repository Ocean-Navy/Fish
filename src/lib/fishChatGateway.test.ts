import assert from "node:assert/strict";
import { test } from "node:test";
import { runFishChatGateway, type FishChatGatewayContext } from "./fishChatGateway";

function context(overrides: Partial<FishChatGatewayContext> = {}): FishChatGatewayContext {
  const now = new Date().toISOString();
  return {
    ledger: { accounts: [] },
    account: {
      id: "acct_test",
      label: "Test account",
      keyHash: "test_hash",
      createdAt: now,
      rotatedAt: null,
      revokedAt: null,
      planId: "free",
      planActivatedAt: now,
      planExpiresAt: null,
      planSource: "pilot_key",
      creditBalance: 25,
      totalCreditsGranted: 25,
      totalCreditsSpent: 0,
      requestCount: 0,
      lastUsedAt: null
    },
    principalId: "guest:test",
    dailyQuotaLimit: 10,
    allowExternalFallback: false,
    authenticatedApiKey: false,
    ...overrides
  };
}

test("batch dishes require an authenticated Fish API key before adapter dispatch", async () => {
  const result = await runFishChatGateway(
    {
      model: "fish-repo",
      messages: [{ role: "user", content: "Map this repo." }],
      stream: false,
      max_tokens: 128,
      metadata: { fish_feature: "repo" }
    },
    context()
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    error: {
      message: "missing_bearer_token",
      type: "authentication_error",
      feature: "repo",
      route: "ocean-batch"
    }
  });
});

test("batch dishes require an Ocean-provider-capable plan for keyed accounts", async () => {
  const result = await runFishChatGateway(
    {
      model: "fish-repo",
      messages: [{ role: "user", content: "Map this repo." }],
      stream: false,
      max_tokens: 128,
      metadata: { fish_feature: "repo" }
    },
    context({ authenticatedApiKey: true, principalId: "key:acct_test" })
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, {
    error: {
      message: "ocean_provider_not_allowed_for_plan",
      type: "routing_policy_error",
      feature: "repo",
      route: "ocean-batch"
    }
  });
});
