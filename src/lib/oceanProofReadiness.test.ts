import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { summarizeOceanProofReadiness } from "./oceanProofReadiness";

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  delete process.env.FISH_OCEAN_BATCH_DIR;
  delete process.env.FISH_OCEAN_BATCH_ENDPOINT;
  delete process.env.FISH_OCEAN_BATCH_API_KEY;
  delete process.env.FISH_OCEAN_BATCH_PROVIDER_ID;
  delete process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD;
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

test("Ocean proof readiness stays sample before adapter or receipt setup", async () => {
  await useTempOceanBatchDir();

  const readiness = await summarizeOceanProofReadiness();

  assert.equal(readiness.dataState, "sample");
  assert.equal(readiness.trafficReady, false);
  assert.equal(readiness.proofReady, false);
  assert.equal(readiness.adapter.healthState, "not_configured");
  assert.equal(readiness.proof.hasNonSampleReceipt, false);
  assert.deepEqual(readiness.blockers, ["FISH_OCEAN_BATCH_ENDPOINT is not configured.", "No successful non-sample Ocean batch receipt has been recorded yet."]);
});

test("Ocean proof readiness does not claim proof when the adapter is unreachable", async () => {
  await useTempOceanBatchDir();
  process.env.FISH_OCEAN_BATCH_ENDPOINT = "http://127.0.0.1:9/jobs";
  process.env.FISH_OCEAN_BATCH_API_KEY = "test-ocean-batch-key-1234567890";
  process.env.FISH_OCEAN_BATCH_PROVIDER_ID = "ocean-navy-local-node";

  const readiness = await summarizeOceanProofReadiness();

  assert.equal(readiness.dataState, "unavailable");
  assert.equal(readiness.trafficReady, false);
  assert.equal(readiness.proofReady, false);
  assert.equal(readiness.adapter.configured, true);
  assert.equal(readiness.adapter.reachable, false);
  assert.equal(readiness.proof.hasNonSampleReceipt, false);
  assert.match(readiness.blockers.join("\n"), /adapter is not reachable/);
  assert.match(readiness.blockers.join("\n"), /No successful non-sample Ocean batch receipt/);
});

test("Ocean proof readiness is snapshot proof after adapter health and non-sample receipt", async () => {
  const batchDir = await useTempOceanBatchDir();
  await writeOceanBatchReceipt(batchDir);
  const { server, url } = await startHealthyAdapter();
  servers.push(server);
  process.env.FISH_OCEAN_BATCH_ENDPOINT = `${url}/jobs`;
  process.env.FISH_OCEAN_BATCH_API_KEY = "test-ocean-batch-key-1234567890";
  process.env.FISH_OCEAN_BATCH_PROVIDER_ID = "ocean-navy-local-node";
  process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD = "5";

  const readiness = await summarizeOceanProofReadiness();

  assert.equal(readiness.dataState, "snapshot");
  assert.equal(readiness.trafficReady, true);
  assert.equal(readiness.proofReady, true);
  assert.equal(readiness.adapter.reachable, true);
  assert.equal(readiness.adapter.mode, "local_ocean_node");
  assert.equal(readiness.adapter.liveReady, true);
  assert.equal(readiness.adapter.configuredForFreeCompute, true);
  assert.deepEqual(readiness.adapter.selected, {
    nodeUrlConfigured: true,
    computeEnvIdConfigured: true,
    datasetDidsConfigured: false,
    algoDidConfigured: false,
    paymentTokenConfigured: false,
    resourcesConfigured: false,
    outputConfigured: true
  });
  assert.equal(readiness.proof.hasNonSampleReceipt, true);
  assert.equal(readiness.proof.nonSampleJobs, 1);
  assert.equal(readiness.route.dailyBudgetUsd, 5);
  assert.deepEqual(readiness.blockers, []);
});

async function useTempOceanBatchDir() {
  const dir = path.join(tmpdir(), `fish-ocean-proof-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  process.env.FISH_OCEAN_BATCH_DIR = dir;
  return dir;
}

async function writeOceanBatchReceipt(batchDir: string) {
  const receiptsDir = path.join(batchDir, "receipts");
  await mkdir(receiptsDir, { recursive: true });
  const receipt = {
    receiptVersion: 1,
    receiptType: "ocean_batch_job_receipt",
    receiptId: "batch_rcpt_local_ocean_1",
    jobId: "batch_job_local_ocean_1",
    providerJobId: "ocean_node_job_1",
    providerId: "ocean-navy-local-node",
    taskType: "document_summary",
    model: "ocean-batch-placeholder",
    backend: "ocean_batch",
    status: "succeeded",
    sourceState: "snapshot",
    adapterMode: "ocean_http",
    visibility: "public",
    storesPromptOutputText: false,
    createdAt: "2026-06-06T00:00:00.000Z",
    startedAt: "2026-06-06T00:00:00.000Z",
    completedAt: "2026-06-06T00:00:04.000Z",
    usage: {
      inputTokens: 24,
      outputTokens: 96,
      totalTokens: 120,
      gpuSeconds: 4,
      items: 1
    },
    cost: {
      userChargeUsd: 0.001,
      providerCostUsd: 0.0005,
      pricingState: "provider_verified"
    },
    hashes: {
      inputHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      outputHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      canonicalReceiptHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    errorCode: null
  };
  await writeFile(path.join(receiptsDir, "2026-06-06T00-00-00.000Z-batch_rcpt_local_ocean_1.json"), JSON.stringify(receipt, null, 2));
}

async function startHealthyAdapter() {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/healthz") {
      response.end(
        JSON.stringify({
          ok: true,
          mode: "local_ocean_node",
          liveReady: true,
          configuredForFreeCompute: true,
          missing: [],
          warnings: [],
          selected: {
            nodeUrl: "configured",
            computeEnvId: "fish-local-free",
            outputConfigured: true
          }
        })
      );
      return;
    }
    if (request.url === "/config") {
      response.end(
        JSON.stringify({
          mode: "local_ocean_node",
          liveReady: true,
          missing: [],
          warnings: [],
          selected: {
            nodeUrl: "configured",
            computeEnvId: "fish-local-free",
            outputConfigured: true
          }
        })
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
