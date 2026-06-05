import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const originalCwd = process.cwd();
let activeTempDir: string | null = null;
let modules: Awaited<ReturnType<typeof loadGatewayModules>> | null = null;

before(async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-chat-gateway-"));
  process.chdir(activeTempDir);
  modules = await loadGatewayModules();
  process.chdir(originalCwd);
});

after(async () => {
  process.chdir(originalCwd);
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("free plan batch dishes stay in sample mode even when the Ocean batch endpoint is configured", async () => {
  const loaded = assertModulesLoaded();
  const endpoint = await useMockBatchEndpoint();
  process.env.FISH_OCEAN_BATCH_ENDPOINT = endpoint.url;

  try {
    const ledger = { accounts: [fishAccount("free-batch-account", "free")] };
    const result = await loaded.runFishChatGateway(chatInput("fish-docs"), {
      ledger,
      account: ledger.accounts[0],
      principalId: "guest:free-batch-sample",
      dailyQuotaLimit: 10,
      allowExternalFallback: false
    });

    assert.equal(result.ok, true);
    assert.equal(endpoint.requests.length, 0);
    const fish = result.body.fish as Record<string, unknown>;
    assert.equal(fish.batchAdapterMode, "sample_success");
    assert.equal(fish.batchSourceState, "sample");
  } finally {
    delete process.env.FISH_OCEAN_BATCH_ENDPOINT;
    await endpoint.close();
  }
});

test("Ocean-provider plans keep using the configured Ocean HTTP batch adapter", async () => {
  const loaded = assertModulesLoaded();
  const endpoint = await useMockBatchEndpoint();
  process.env.FISH_OCEAN_BATCH_ENDPOINT = endpoint.url;

  try {
    const ledger = { accounts: [fishAccount("provider-batch-account", "provider-test")] };
    const result = await loaded.runFishChatGateway(chatInput("fish-docs"), {
      ledger,
      account: ledger.accounts[0],
      principalId: "key:provider-batch-account",
      dailyQuotaLimit: 10,
      allowExternalFallback: true
    });

    assert.equal(result.ok, true);
    assert.equal(endpoint.requests.length, 1);
    assert.equal(endpoint.requests[0].taskType, "document_summary");
    const fish = result.body.fish as Record<string, unknown>;
    assert.equal(fish.batchAdapterMode, "ocean_http");
    assert.equal(fish.batchSourceState, "snapshot");
  } finally {
    delete process.env.FISH_OCEAN_BATCH_ENDPOINT;
    await endpoint.close();
  }
});

async function loadGatewayModules() {
  const { runFishChatGateway } = await import("./fishChatGateway");
  return { runFishChatGateway };
}

function assertModulesLoaded() {
  assert.ok(modules);
  return modules;
}

function fishAccount(id: string, planId: "free" | "provider-test") {
  return {
    id,
    label: id,
    keyHash: `${id}-hash`,
    createdAt: new Date().toISOString(),
    rotatedAt: null,
    revokedAt: null,
    planId,
    planActivatedAt: null,
    planExpiresAt: null,
    planSource: "pilot_key" as const,
    creditBalance: 100,
    totalCreditsGranted: 100,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null
  };
}

function chatInput(model: string) {
  return {
    model,
    messages: [{ role: "user" as const, content: "Summarize this short Fish docs page." }],
    stream: false,
    max_tokens: 64
  };
}

async function useMockBatchEndpoint() {
  const requests: Record<string, unknown>[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          jobId: "provider-job-1",
          providerJobId: "provider-job-1",
          status: "succeeded",
          usage: {
            inputTokens: 8,
            outputTokens: 4,
            gpuSeconds: 1,
            items: 1
          },
          cost: {
            amount: 0.01,
            currency: "USDC"
          },
          outputRef: "sha256:provider-output"
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
