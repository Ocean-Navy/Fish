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

test("public testnet secret generator rejects incomplete faucet config", () => {
  const result = runSecrets(["--include-faucet", "--json"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Cannot generate faucet env/);
  assert.match(result.stderr, /--test-ocean-address/);
  assert.match(result.stderr, /--test-usdc-address/);
  assert.match(result.stderr, /--include-wallets/);
});

test("public testnet secret generator puts faucet settings in the web env", () => {
  const result = runSecrets([
    "--include-wallets",
    "--include-faucet",
    "--test-ocean-address",
    TEST_OCEAN_ADDRESS,
    "--test-usdc-address",
    TEST_USDC_ADDRESS,
    "--json"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.includeFaucet, true);
  assert.equal(payload.appEnv.FISH_TRUST_PROXY_HEADERS, "true");
  assert.equal(payload.appEnv.FISH_TESTNET_FAUCET_ENABLED, "true");
  assert.equal(payload.appEnv.FISH_TESTNET_FAUCET_CHAIN_ID, "84532");
  assert.equal(payload.appEnv.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS, TEST_OCEAN_ADDRESS);
  assert.equal(payload.appEnv.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS, TEST_USDC_ADDRESS);
  assert.match(payload.appEnv.FISH_TESTNET_FAUCET_PRIVATE_KEY, /^0x[0-9a-f]{64}$/i);
  assert.equal(payload.oceanEnv.FISH_TESTNET_FAUCET_PRIVATE_KEY, undefined);
});

test("public testnet readiness accepts a generated private faucet overlay without exposing secrets", async () => {
  const secrets = runSecrets([
    "--include-wallets",
    "--include-faucet",
    "--test-ocean-address",
    TEST_OCEAN_ADDRESS,
    "--test-usdc-address",
    TEST_USDC_ADDRESS,
    "--json"
  ]);
  assert.equal(secrets.status, 0, secrets.stderr);
  const payload = JSON.parse(secrets.stdout);
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const appOverlay = await tempEnv(formatEnv(payload.appEnv));
  const result = runReadiness(["--env", appEnv, "--app-env-overlay", appOverlay, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(payload.appEnv.FISH_ADMIN_TOKEN));
  assert.doesNotMatch(result.stdout, new RegExp(payload.appEnv.FISH_PROXY_HEADER_SECRET));
  assert.doesNotMatch(result.stdout, new RegExp(payload.appEnv.FISH_TESTNET_FAUCET_PRIVATE_KEY));
  assert.doesNotMatch(result.stdout, /BEGIN PRIVATE KEY/);

  const summary = JSON.parse(result.stdout);
  const faucet = summary.checks.find((check: { name: string }) => check.name === "Public testnet faucet");

  assert.equal(faucet.state, "ready");
  assert.deepEqual(faucet.findings, []);
});

const TEST_OCEAN_ADDRESS = "0x1111111111111111111111111111111111111111";
const TEST_USDC_ADDRESS = "0x2222222222222222222222222222222222222222";

function runSecrets(args: string[]) {
  return spawnSync(process.execPath, ["scripts/generate-public-testnet-secrets.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

function runReadiness(args: string[]) {
  return spawnSync(process.execPath, ["scripts/audit-public-testnet-readiness.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

async function tempEnv(contents: string) {
  const dir = path.join(tmpdir(), `fish-secrets-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const file = path.join(dir, ".env.test");
  await writeFile(file, contents);
  return file;
}

function missingOceanEnv() {
  return path.join(tmpdir(), `fish-missing-ocean-env-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function formatEnv(env: Record<string, string>) {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${shellSafeValue(value)}`)
    .join("\n");
}

function shellSafeValue(value: string) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
