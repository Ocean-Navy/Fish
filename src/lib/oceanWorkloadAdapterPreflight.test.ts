import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const tempDirs: string[] = [];
const proofPrivateKey = "0x0000000000000000000000000000000000000000000000000000000000000001";
const adapterApiKey = "adapter-key-12345678901234567890";

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

test("Ocean workload adapter preflight accepts a structurally complete external free-compute config", async () => {
  const envFile = await tempEnv(
    [
      "OCEAN_WORKLOAD_ADAPTER_MODE=live",
      `OCEAN_WORKLOAD_ADAPTER_API_KEY=${adapterApiKey}`,
      `OCEAN_PROOF_PRIVATE_KEY=${proofPrivateKey}`,
      "OCEAN_PROOF_RPC=https://mainnet.base.org",
      "NODE_URL=https://node.oncompute.example",
      "FISH_OCEAN_DATASET_DIDS=[]",
      "FISH_OCEAN_ALGO_DID=did:op:fish-no-dataset-proof",
      "FISH_OCEAN_COMPUTE_ENV_ID=fish-external-free",
      "FISH_OCEAN_CLI_BIN=/bin/echo"
    ].join("\n")
  );
  const result = runPreflight(envFile);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.liveReady, true);
  assert.equal(payload.configuredForFreeCompute, true);
  assert.deepEqual(payload.missing, []);
  assert.equal(payload.secrets.adapterApiKeyConfigured, true);
  assert.equal(payload.secrets.proofWalletConfigured, true);
  assert.equal(payload.secrets.rpcConfigured, true);
});

test("Ocean workload adapter preflight rejects malformed external proof config without leaking secrets", async () => {
  const envFile = await tempEnv(
    [
      "OCEAN_WORKLOAD_ADAPTER_MODE=live",
      `OCEAN_WORKLOAD_ADAPTER_API_KEY=${adapterApiKey}`,
      `OCEAN_PROOF_PRIVATE_KEY=${proofPrivateKey}`,
      "OCEAN_PROOF_RPC=http://127.0.0.1:8545",
      "NODE_URL=https://operator:secret@node.oncompute.example",
      "FISH_OCEAN_DATASET_DIDS=not-a-did",
      "FISH_OCEAN_ALGO_DID=fish-no-dataset-proof",
      "FISH_OCEAN_COMPUTE_ENV_ID=fish-external-paid",
      "FISH_OCEAN_PAYMENT_TOKEN=0x1111111111111111111111111111111111111111",
      "FISH_OCEAN_RESOURCES={cpu:1}",
      "FISH_OCEAN_OUTPUT=[]",
      "FISH_OCEAN_CLI_BIN=/bin/echo"
    ].join("\n")
  );
  const result = runPreflight(envFile);

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, new RegExp(adapterApiKey));
  assert.doesNotMatch(result.stdout, new RegExp(proofPrivateKey));
  assert.doesNotMatch(result.stdout, /127\.0\.0\.1:8545/);
  assert.doesNotMatch(result.stdout, /operator:secret/);

  const payload = JSON.parse(result.stdout);

  assert.equal(payload.liveReady, false);
  assert.match(payload.missing.join("\n"), /non-loopback RPC/);
  assert.match(payload.missing.join("\n"), /NODE_URL without embedded credentials/);
  assert.match(payload.missing.join("\n"), /valid FISH_OCEAN_DATASET_DIDS/);
  assert.match(payload.missing.join("\n"), /valid FISH_OCEAN_ALGO_DID/);
  assert.match(payload.missing.join("\n"), /valid JSON object FISH_OCEAN_RESOURCES/);
  assert.match(payload.missing.join("\n"), /valid JSON object FISH_OCEAN_OUTPUT/);
});

async function tempEnv(contents: string) {
  const dir = path.join(tmpdir(), `fish-adapter-preflight-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const file = path.join(dir, ".env.test");
  await writeFile(file, contents);
  return file;
}

function runPreflight(envFile: string) {
  return spawnSync(process.execPath, ["deploy/ocean-workload-adapter/server.mjs", "--preflight", "--env-file", envFile], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      NODE_ENV: "test"
    }
  });
}
