import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";
import type { FishChatGatewayContext } from "./fishChatGateway";
import type { Account, ChatCompletionInput, Ledger } from "./fishLedger";

const previousEnv = new Map<string, string | undefined>();
const touchedEnv = ["FISH_MAX_CONCURRENT_REQUESTS", "FISH_OCEAN_BATCH_ENDPOINT", "FISH_OCEAN_BATCH_TIMEOUT_MS", "FISH_OCEAN_BATCH_DAILY_BUDGET_USD", "FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS"];
const originalLedgerDir = process.env.FISH_LEDGER_DIR;
const originalOceanBatchDir = process.env.FISH_OCEAN_BATCH_DIR;
let activeTempDir: string | null = null;
let modules: Awaited<ReturnType<typeof loadModules>> | null = null;

before(async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-chat-gateway-"));
  process.env.FISH_LEDGER_DIR = activeTempDir;
  // Keep ocean-batch budget state inside the temp dir — never in the repo's live data/.
  process.env.FISH_OCEAN_BATCH_DIR = path.join(activeTempDir, "ocean-batch");
  modules = await loadModules();
});

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

after(async () => {
  if (originalLedgerDir === undefined) {
    delete process.env.FISH_LEDGER_DIR;
  } else {
    process.env.FISH_LEDGER_DIR = originalLedgerDir;
  }
  if (originalOceanBatchDir === undefined) {
    delete process.env.FISH_OCEAN_BATCH_DIR;
  } else {
    process.env.FISH_OCEAN_BATCH_DIR = originalOceanBatchDir;
  }
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
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
  const loaded = assertModulesLoaded();
  const result = await loaded.runFishChatGateway(
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
  const loaded = assertModulesLoaded();
  const result = await loaded.runFishChatGateway(
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
  const loaded = assertModulesLoaded();
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

    const created = await loaded.createApiKey("Docs concurrency test", 1000, "provider-test");
    const auth = await loaded.authenticateRequest(authorizedRequest(created.key));
    assert.equal(auth.ok, true);
    if (!auth.ok) {
      throw new Error("docs concurrency account did not authenticate");
    }
    const gatewayContext: FishChatGatewayContext = {
      ledger: auth.ledger,
      account: auth.account,
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

    const results = await Promise.all([loaded.runFishChatGateway(input, gatewayContext), loaded.runFishChatGateway(input, gatewayContext), loaded.runFishChatGateway(input, gatewayContext)]);

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
  const loaded = assertModulesLoaded();
  const account = buildAccount({
    id: "security-test-account",
    label: "Security test account",
    keyHash: "test-key-hash",
    createdAt: new Date(0).toISOString()
  });
  const ledger: Ledger = { accounts: [account] };

  const result = await loaded.runFishChatGateway(
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

async function loadModules() {
  const gateway = await import("./fishChatGateway");
  const ledger = await import("./fishLedger");
  return {
    runFishChatGateway: gateway.runFishChatGateway,
    createApiKey: ledger.createApiKey,
    authenticateRequest: ledger.authenticateRequest
  };
}

function assertModulesLoaded() {
  assert.ok(modules);
  return modules;
}

function authorizedRequest(key: string) {
  return new Request("http://127.0.0.1/v1", {
    headers: {
      authorization: `Bearer ${key}`
    }
  });
}

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
