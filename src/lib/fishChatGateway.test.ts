import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { runFishChatGateway, type FishChatGatewayContext } from "./fishChatGateway";
import type { Account, ChatCompletionInput, Ledger } from "./fishLedger";

const previousEnv = new Map<string, string | undefined>();
const touchedEnv = ["FISH_MAX_CONCURRENT_REQUESTS", "FISH_OCEAN_BATCH_ENDPOINT", "FISH_OCEAN_BATCH_TIMEOUT_MS", "FISH_OCEAN_BATCH_DAILY_BUDGET_USD", "FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS"];

afterEach(() => {
  for (const key of touchedEnv) {
    const value = previousEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    previousEnv.delete(key);
  }
});

function context(overrides: Partial<FishChatGatewayContext> = {}): FishChatGatewayContext {
  const now = new Date().toISOString();
  return {
    ledger: { accounts: [] },
    account: buildAccount({
      id: "acct_test",
      label: "Test account",
      keyHash: "test_hash",
      createdAt: now,
      planId: "free",
      planActivatedAt: now,
      planSource: "pilot_key",
      creditBalance: 25,
      totalCreditsGranted: 25
    }),
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

test("Fish docs batch chat uses the global concurrency guard", async () => {
  rememberEnv();
  process.env.FISH_MAX_CONCURRENT_REQUESTS = "1";
  process.env.FISH_OCEAN_BATCH_TIMEOUT_MS = "2000";
  process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD = "1000";
  process.env.FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS = "2";

  let activeBatchRequests = 0;
  let maxActiveBatchRequests = 0;
  let totalBatchRequests = 0;
  const server = http.createServer(async (_request, response) => {
    activeBatchRequests += 1;
    totalBatchRequests += 1;
    maxActiveBatchRequests = Math.max(maxActiveBatchRequests, activeBatchRequests);
    await new Promise((resolve) => setTimeout(resolve, 150));
    activeBatchRequests -= 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "succeeded", outputRef: `sha256:${"a".repeat(64)}` }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("docs concurrency test server did not bind");
    }
    process.env.FISH_OCEAN_BATCH_ENDPOINT = `http://127.0.0.1:${address.port}`;

    const ledger: Ledger = { accounts: [] };
    const account = buildAccount({
      id: `acct_docs_concurrency_${Date.now()}`,
      label: "Docs concurrency test",
      planId: "provider-test",
      creditBalance: 1000,
      totalCreditsGranted: 1000
    });
    ledger.accounts.push(account);
    const gatewayContext: FishChatGatewayContext = {
      ledger,
      account,
      principalId: `docs-concurrency-${Date.now()}`,
      dailyQuotaLimit: 100,
      allowExternalFallback: false,
      authenticatedApiKey: true
    };
    const input: ChatCompletionInput = {
      model: "fish-docs",
      messages: [{ role: "user", content: "Summarize this short document for the Fish docs test." }],
      stream: false,
      max_tokens: 20
    };

    const results = await Promise.all([runFishChatGateway(input, gatewayContext), runFishChatGateway(input, gatewayContext), runFishChatGateway(input, gatewayContext)]);

    assert.equal(results.filter((result) => result.ok).length, 1);
    const rejected = results.filter((result) => !result.ok);
    assert.equal(rejected.length, 2);
    assert.deepEqual(rejected.map((result) => result.status), [429, 429]);
    assert.equal(totalBatchRequests, 1);
    assert.equal(maxActiveBatchRequests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("Ocean helper rejects oversized prompts before quota or credit mutations", async () => {
  const account = buildAccount({
    id: "security-test-account",
    label: "Security test account",
    keyHash: "test-key-hash",
    createdAt: new Date(0).toISOString()
  });
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
      allowExternalFallback: false,
      authenticatedApiKey: false
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal((result.body.error as { message?: string }).message, "max_input_tokens_exceeded");
  assert.equal(account.creditBalance, 25);
  assert.equal(account.requestCount, 0);
});

function rememberEnv() {
  for (const key of touchedEnv) {
    previousEnv.set(key, process.env[key]);
  }
}

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: `acct_${Date.now()}`,
    label: "Test account",
    keyHash: "test-key-hash",
    createdAt: new Date().toISOString(),
    rotatedAt: null,
    revokedAt: null,
    planId: "free",
    planActivatedAt: null,
    planExpiresAt: null,
    planSource: null,
    creditBalance: 25,
    totalCreditsGranted: 25,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null,
    ...overrides
  };
}
