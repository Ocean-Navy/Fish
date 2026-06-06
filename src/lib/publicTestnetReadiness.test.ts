import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

test("public testnet readiness treats paused paid checkout as manual", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const payments = summary.checks.find((check: { name: string }) => check.name === "Payments/mainnet checkout");

  assert.equal(summary.profile, "public-testnet");
  assert.equal(summary.strict, false);
  assert.equal(payments.state, "manual");
  assert.match(payments.findings.join("\n"), /do not block a no-real-money public testnet/);
});

test("strict public testnet readiness fails on unresolved manual or partial checks", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--strict", "--json"]);

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);

  assert.equal(summary.profile, "public-testnet");
  assert.equal(summary.strict, true);
  assert.equal(summary.checks.some((check: { state: string }) => check.state !== "ready"), true);
});

test("paid mainnet readiness blocks while paid checkout is paused", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const result = runReadiness(["--profile", "paid-mainnet", "--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  const payments = summary.checks.find((check: { name: string }) => check.name === "Payments/mainnet checkout");

  assert.equal(summary.profile, "paid-mainnet");
  assert.equal(payments.state, "blocked");
  assert.match(payments.findings.join("\n"), /paid checkout cannot launch/);
});

test("Ocean demo readiness flags free compute without a wallet allowlist", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const oceanEnv = await tempEnv(oceanEnvWithComputeAccess([]));
  const result = runReadiness(["--env", appEnv, "--ocean-env", oceanEnv, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const ocean = summary.checks.find((check: { name: string }) => check.name === "GPU/Ocean demo stack");

  assert.equal(ocean.state, "partial");
  assert.match(ocean.findings.join("\n"), /empty free\.access\.addresses/);
});

test("Ocean demo readiness accepts free compute restricted to the proof wallet", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const oceanEnv = await tempEnv(oceanEnvWithComputeAccess([PROOF_WALLET_ADDRESS]));
  const result = runReadiness(["--env", appEnv, "--ocean-env", oceanEnv, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const ocean = summary.checks.find((check: { name: string }) => check.name === "GPU/Ocean demo stack");

  assert.doesNotMatch(ocean.findings.join("\n"), /free\.access\.addresses/);
  assert.doesNotMatch(ocean.findings.join("\n"), /proof wallet/);
});

const PROOF_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
const PROOF_WALLET_ADDRESS = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

async function tempEnv(contents: string) {
  const dir = path.join(tmpdir(), `fish-readiness-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const file = path.join(dir, ".env.test");
  await writeFile(file, contents);
  return file;
}

function missingOceanEnv() {
  return path.join(tmpdir(), `fish-missing-ocean-env-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function oceanEnvWithComputeAccess(addresses: string[]) {
  const computeEnvironments = [
    {
      socketPath: "/var/run/docker.sock",
      environments: [
        {
          id: "fish-local-free",
          free: {
            access: {
              addresses
            }
          }
        }
      ]
    }
  ];
  return [
    "OCEAN_WORKLOAD_ADAPTER_API_KEY=12345678901234567890123456789012",
    "OCEAN_NODE_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
    `OCEAN_PROOF_PRIVATE_KEY=${PROOF_PRIVATE_KEY}`,
    "FISH_OCEAN_COMPUTE_ENV_ID=fish-local-free",
    "OCEAN_NODE_HTTP_BIND=127.0.0.1",
    "OCEAN_WORKLOAD_ADAPTER_BIND=127.0.0.1",
    "OCEAN_NODE_P2P_BIND=127.0.0.1",
    `OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS=${JSON.stringify(computeEnvironments)}`
  ].join("\n");
}

function runReadiness(args: string[]) {
  return spawnSync(process.execPath, ["scripts/audit-public-testnet-readiness.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}
