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

test("public testnet secret generator maps a contract deployment into read-only web env", async () => {
  const deployment = await tempDeployment();
  const result = runSecrets(["--contract-deployment", deployment, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.includeContractDeployment, true);
  assert.equal(payload.appEnv.FISH_CONTRACT_CHAIN_ID, "84532");
  assert.equal(payload.appEnv.FISH_CONTRACT_CHAIN_NAME, "Base Sepolia");
  assert.equal(payload.appEnv.FISH_CONTRACT_RPC_URL, "https://sepolia.base.org");
  assert.equal(payload.appEnv.FISH_CONTRACT_OCEAN_TOKEN_ADDRESS, TEST_OCEAN_ADDRESS);
  assert.equal(payload.appEnv.FISH_CONTRACT_USDC_TOKEN_ADDRESS, TEST_USDC_ADDRESS);
  assert.equal(payload.appEnv.FISH_CONTRACT_FISH_TOKEN_ADDRESS, TEST_FISH_ADDRESS);
  assert.equal(payload.appEnv.FISH_CONTRACT_OCEAN_STAKING_ADDRESS, TEST_STAKING_ADDRESS);
  assert.equal(payload.appEnv.FISH_CONTRACT_CAPACITY_POOL_ADDRESS, TEST_CAPACITY_ADDRESS);
  assert.equal(payload.appEnv.FISH_CONTRACT_ACTIONS_ENABLED, "false");
  assert.equal(payload.appEnv.FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED, "false");
  assert.equal(payload.appEnv.FISH_CONTRACT_OPERATOR_PRIVATE_KEY, undefined);
});

test("public testnet secret generator derives faucet token addresses from the contract deployment", async () => {
  const deployment = await tempDeployment();
  const result = runSecrets(["--include-wallets", "--include-faucet", "--contract-deployment", deployment, "--enable-contract-actions", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.appEnv.FISH_CONTRACT_ACTIONS_ENABLED, "true");
  assert.equal(payload.appEnv.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS, TEST_OCEAN_ADDRESS);
  assert.equal(payload.appEnv.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS, TEST_USDC_ADDRESS);
  assert.match(payload.appEnv.FISH_TESTNET_FAUCET_PRIVATE_KEY, /^0x[0-9a-f]{64}$/i);
});

test("public testnet readiness accepts generated contract and faucet overlay", async () => {
  const deployment = await tempDeployment();
  const secrets = runSecrets(["--include-wallets", "--include-faucet", "--contract-deployment", deployment, "--json"]);
  assert.equal(secrets.status, 0, secrets.stderr);
  const payload = JSON.parse(secrets.stdout);
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const appOverlay = await tempEnv(formatEnv(payload.appEnv));
  const result = runReadiness(["--env", appEnv, "--app-env-overlay", appOverlay, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(payload.appEnv.FISH_TESTNET_FAUCET_PRIVATE_KEY));

  const summary = JSON.parse(result.stdout);
  const faucet = summary.checks.find((check: { name: string }) => check.name === "Public testnet faucet");
  const contracts = summary.checks.find((check: { name: string }) => check.name === "Contract status and staking pages");

  assert.equal(faucet.state, "ready");
  assert.equal(contracts.state, "ready");
  assert.deepEqual(contracts.findings, []);
});

test("public testnet secret generator refuses contract actions outside Base Sepolia", async () => {
  const deployment = await tempDeployment({ chainId: 1, network: "ethereum" });
  const result = runSecrets(["--contract-deployment", deployment, "--enable-contract-actions", "--contract-rpc-url", "https://ethereum.example", "--json"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Base Sepolia deployment artifact with chainId 84532/);
});

test("public testnet secret generator refuses settlement and faucet derivation outside Base Sepolia", async () => {
  const deployment = await tempDeployment({ chainId: 137, network: "polygon" });
  const result = runSecrets([
    "--include-wallets",
    "--include-faucet",
    "--contract-deployment",
    deployment,
    "--enable-contract-settlement",
    "--contract-rpc-url",
    "https://polygon.example",
    "--contract-operator-private-key",
    "0x9999999999999999999999999999999999999999999999999999999999999999",
    "--json"
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--enable-contract-settlement/);
  assert.match(result.stderr, /--include-faucet with --contract-deployment/);
  assert.match(result.stderr, /Base Sepolia deployment artifact with chainId 84532/);
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
const TEST_FISH_ADDRESS = "0x3333333333333333333333333333333333333333";
const TEST_STAKING_ADDRESS = "0x4444444444444444444444444444444444444444";
const TEST_CAPACITY_ADDRESS = "0x5555555555555555555555555555555555555555";
const TEST_TREASURY_ADDRESS = "0x6666666666666666666666666666666666666666";
const TEST_EMISSION_ADDRESS = "0x7777777777777777777777777777777777777777";
const TEST_OPERATOR_ADDRESS = "0x8888888888888888888888888888888888888888";

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

async function tempDeployment(options: { chainId?: number; network?: string } = {}) {
  const dir = path.join(tmpdir(), `fish-deployment-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const file = path.join(dir, "baseSepolia.local.json");
  await writeFile(
    file,
    `${JSON.stringify(
      {
        network: options.network ?? "baseSepolia",
        chainId: options.chainId ?? 84532,
        deployedAt: "2026-06-06T00:00:00.000Z",
        deployer: TEST_TREASURY_ADDRESS,
        treasury: TEST_TREASURY_ADDRESS,
        emissionSource: TEST_EMISSION_ADDRESS,
        operator: TEST_OPERATOR_ADDRESS,
        contracts: {
          oceanToken: TEST_OCEAN_ADDRESS,
          usdcToken: TEST_USDC_ADDRESS,
          fishToken: TEST_FISH_ADDRESS,
          oceanStaking: TEST_STAKING_ADDRESS,
          capacityPool: TEST_CAPACITY_ADDRESS
        },
        parameters: {
          fishCooldownSeconds: 300,
          oceanCooldownSeconds: 300,
          minUnstakeBatchOpenSeconds: 60
        }
      },
      null,
      2
    )}\n`
  );
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
