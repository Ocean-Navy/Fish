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
  assert.equal(readiness.claim.level, "setup");
  assert.match(readiness.claim.boundary, /not claiming Ocean workload proof/);
  assert.deepEqual(readiness.claim.notClaimed, ["Paid third-party Oncompute demand", "Raw prompts or answers in public proof", "Staking alone funds compute"]);
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
  assert.equal(readiness.claim.level, "setup");
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
  assert.equal(readiness.claim.level, "local-ocean-node");
  assert.equal(readiness.claim.title, "Ocean Node proof");
  assert.equal(readiness.claim.headline, "Fish can run test dishes through an Ocean Node operated by Ocean Navy.");
  assert.match(readiness.claim.boundary, /does not prove live Ocean CLI tickets/);
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

test("Ocean proof readiness uses the latest successful non-sample receipt for public proof state", async () => {
  const batchDir = await useTempOceanBatchDir();
  await writeOceanBatchReceipt(batchDir, {
    receiptId: "batch_rcpt_local_ocean_old",
    jobId: "batch_job_local_ocean_old",
    createdAt: "2026-06-06T00:00:00.000Z",
    sourceState: "snapshot",
    status: "succeeded",
    outputHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  });
  await writeOceanBatchReceipt(batchDir, {
    receiptId: "batch_rcpt_sample_new",
    jobId: "batch_job_sample_new",
    createdAt: "2026-06-06T00:05:00.000Z",
    sourceState: "sample",
    status: "succeeded",
    outputHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  });
  const { server, url } = await startHealthyAdapter();
  servers.push(server);
  process.env.FISH_OCEAN_BATCH_ENDPOINT = `${url}/jobs`;
  process.env.FISH_OCEAN_BATCH_API_KEY = "test-ocean-batch-key-1234567890";
  process.env.FISH_OCEAN_BATCH_PROVIDER_ID = "ocean-navy-local-node";

  const readiness = await summarizeOceanProofReadiness();

  assert.equal(readiness.proofReady, true);
  assert.equal(readiness.claim.level, "local-ocean-node");
  assert.equal(readiness.proof.latestReceiptState, "snapshot");
  assert.equal(readiness.proof.latestReceiptAdapterMode, "ocean_http");
  assert.equal(readiness.proof.latestReceiptAt, "2026-06-06T00:00:00.000Z");
});

test("Ocean proof readiness does not relabel a snapshot receipt as an Ocean CLI proof when the current adapter is live", async () => {
  const batchDir = await useTempOceanBatchDir();
  await writeOceanBatchReceipt(batchDir, {
    receiptId: "batch_rcpt_snapshot_before_live_adapter",
    jobId: "batch_job_snapshot_before_live_adapter",
    createdAt: "2026-06-06T00:00:00.000Z",
    sourceState: "snapshot",
    status: "succeeded",
    outputHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  });
  const { server, url } = await startHealthyAdapter({ mode: "live", configuredForFreeCompute: false });
  servers.push(server);
  process.env.FISH_OCEAN_BATCH_ENDPOINT = `${url}/jobs`;
  process.env.FISH_OCEAN_BATCH_API_KEY = "test-ocean-batch-key-1234567890";
  process.env.FISH_OCEAN_BATCH_PROVIDER_ID = "ocean-navy-live-adapter";

  const readiness = await summarizeOceanProofReadiness();

  assert.equal(readiness.trafficReady, true);
  assert.equal(readiness.proofReady, true);
  assert.equal(readiness.adapter.mode, "live");
  assert.equal(readiness.proof.latestReceiptState, "snapshot");
  assert.equal(readiness.proof.latestReceiptAdapterMode, "ocean_http");
  assert.equal(readiness.claim.level, "local-ocean-node");
  assert.notEqual(readiness.claim.level, "ocean-cli");
  assert.match(readiness.claim.boundary, /does not prove live Ocean CLI tickets/);
});

async function useTempOceanBatchDir() {
  const dir = path.join(tmpdir(), `fish-ocean-proof-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  process.env.FISH_OCEAN_BATCH_DIR = dir;
  return dir;
}

async function writeOceanBatchReceipt(
  batchDir: string,
  overrides: Partial<{
    receiptId: string;
    jobId: string;
    createdAt: string;
    sourceState: "live" | "snapshot" | "sample" | "unavailable";
    status: "succeeded" | "failed" | "timed_out";
    outputHash: string | null;
  }> = {}
) {
  const receiptsDir = path.join(batchDir, "receipts");
  await mkdir(receiptsDir, { recursive: true });
  const createdAt = overrides.createdAt ?? "2026-06-06T00:00:00.000Z";
  const receiptId = overrides.receiptId ?? "batch_rcpt_local_ocean_1";
  const receipt = {
    receiptVersion: 1,
    receiptType: "ocean_batch_job_receipt",
    receiptId,
    jobId: overrides.jobId ?? "batch_job_local_ocean_1",
    providerJobId: "ocean_node_job_1",
    providerId: "ocean-navy-local-node",
    taskType: "document_summary",
    model: "ocean-batch-placeholder",
    backend: "ocean_batch",
    status: overrides.status ?? "succeeded",
    sourceState: overrides.sourceState ?? "snapshot",
    adapterMode: overrides.sourceState === "sample" ? "sample_success" : "ocean_http",
    visibility: "public",
    storesPromptOutputText: false,
    createdAt,
    startedAt: createdAt,
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
      outputHash: overrides.outputHash ?? "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      canonicalReceiptHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    errorCode: null
  };
  await writeFile(path.join(receiptsDir, `${createdAt}-${receiptId}.json`.replaceAll(":", "-")), JSON.stringify(receipt, null, 2));
}

async function startHealthyAdapter(
  options: { mode?: "local_ocean_node" | "live"; configuredForFreeCompute?: boolean } = {}
) {
  const mode = options.mode ?? "local_ocean_node";
  const configuredForFreeCompute = options.configuredForFreeCompute ?? true;
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/healthz") {
      response.end(
        JSON.stringify({
          ok: true,
          mode,
          liveReady: true,
          configuredForFreeCompute,
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
          mode,
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
