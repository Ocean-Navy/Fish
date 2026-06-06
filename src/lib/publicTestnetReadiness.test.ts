import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
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

test("paid mainnet readiness blocks checkout without support and refund links", async () => {
  const appEnv = await tempEnv(
    [
      "FISH_MAX_OUTSTANDING_PREPAID_CREDITS=100000",
      "FISH_STRIPE_SECRET_KEY=sk_test_configured",
      "FISH_STRIPE_WEBHOOK_SECRET=whsec_configured"
    ].join("\n")
  );
  const result = runReadiness(["--profile", "paid-mainnet", "--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  const payments = summary.checks.find((check: { name: string }) => check.name === "Payments/mainnet checkout");

  assert.equal(payments.state, "blocked");
  assert.match(payments.findings.join("\n"), /FISH_BILLING_SUPPORT_URL/);
  assert.match(payments.findings.join("\n"), /FISH_BILLING_REFUND_POLICY_URL/);
});

test("public web readiness blocks an unconfigured Ocean demo route", async () => {
  const appEnv = await tempEnv(["FISH_PAID_TOPUPS_PAUSED=true", "FISH_ADMIN_TOKEN=12345678901234567890123456789012", "FISH_CHAT_ROUTE=ocean-first"].join("\n"));
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  const web = summary.checks.find((check: { name: string }) => check.name === "Public web env");

  assert.equal(web.state, "blocked");
  assert.match(web.findings.join("\n"), /Selected chat route ocean-demo-vllm is not ready/);
});

test("public web readiness accepts a configured Ocean demo route", async () => {
  const appEnv = await tempEnv(
    [
      "FISH_PAID_TOPUPS_PAUSED=true",
      "FISH_ADMIN_TOKEN=12345678901234567890123456789012",
      "FISH_CHAT_ROUTE=ocean-first",
      "FISH_OCEAN_DEMO_VLLM_BASE_URL=http://127.0.0.1:8088/v1",
      "FISH_OCEAN_DEMO_VLLM_API_KEY=12345678901234567890123456789012",
      "FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat",
      "FISH_OCEAN_DEMO_DAILY_BUDGET_USD=5"
    ].join("\n")
  );
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const web = summary.checks.find((check: { name: string }) => check.name === "Public web env");

  assert.notEqual(web.state, "blocked");
  assert.doesNotMatch(web.findings.join("\n"), /Selected chat route/);
});

test("public testnet readiness flags oversized faucet grants", async () => {
  const appEnv = await tempEnv(
    [
      "FISH_PAID_TOPUPS_PAUSED=true",
      "FISH_TRUST_PROXY_HEADERS=true",
      "FISH_PROXY_HEADER_SECRET=fishproxytoken32charsabcdefghi",
      "FISH_TESTNET_FAUCET_ENABLED=true",
      "FISH_TESTNET_FAUCET_CHAIN_ID=84532",
      "FISH_TESTNET_FAUCET_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "FISH_TESTNET_FAUCET_RPC_URL=https://sepolia.base.org",
      "FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS=0x1111111111111111111111111111111111111111",
      "FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS=0x2222222222222222222222222222222222222222",
      "FISH_TESTNET_FAUCET_ETH_AMOUNT=0.01",
      "FISH_TESTNET_FAUCET_OCEAN_AMOUNT=1000000",
      "FISH_TESTNET_FAUCET_USDC_AMOUNT=1000",
      "FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS=1000",
      "FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS=0",
      "FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS=0"
    ].join("\n")
  );
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const faucet = summary.checks.find((check: { name: string }) => check.name === "Public testnet faucet");

  assert.equal(faucet.state, "partial");
  assert.match(faucet.findings.join("\n"), /ETH grant is too high/);
  assert.match(faucet.findings.join("\n"), /daily claim cap is too high/);
  assert.match(faucet.findings.join("\n"), /Wallet cooldown is too low/);
});

test("public testnet readiness requires trusted proxy identity before enabling the faucet", async () => {
  const appEnv = await tempEnv(
    [
      "FISH_PAID_TOPUPS_PAUSED=true",
      "FISH_TESTNET_FAUCET_ENABLED=true",
      "FISH_TESTNET_FAUCET_CHAIN_ID=84532",
      "FISH_TESTNET_FAUCET_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "FISH_TESTNET_FAUCET_RPC_URL=https://sepolia.base.org",
      "FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS=0x1111111111111111111111111111111111111111",
      "FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS=0x2222222222222222222222222222222222222222",
      "FISH_TESTNET_FAUCET_ETH_AMOUNT=0.0005",
      "FISH_TESTNET_FAUCET_OCEAN_AMOUNT=1000",
      "FISH_TESTNET_FAUCET_USDC_AMOUNT=25",
      "FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS=50",
      "FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS=24",
      "FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS=24"
    ].join("\n")
  );
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const faucet = summary.checks.find((check: { name: string }) => check.name === "Public testnet faucet");

  assert.equal(faucet.state, "partial");
  assert.match(faucet.findings.join("\n"), /FISH_TRUST_PROXY_HEADERS must be true/);
  assert.match(faucet.findings.join("\n"), /FISH_PROXY_HEADER_SECRET is missing or weak/);
});

test("public testnet readiness accepts conservative faucet limits", async () => {
  const appEnv = await tempEnv(
    [
      "FISH_PAID_TOPUPS_PAUSED=true",
      "FISH_TRUST_PROXY_HEADERS=true",
      "FISH_PROXY_HEADER_SECRET=fishproxytoken32charsabcdefghi",
      "FISH_TESTNET_FAUCET_ENABLED=true",
      "FISH_TESTNET_FAUCET_CHAIN_ID=84532",
      "FISH_TESTNET_FAUCET_PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111",
      "FISH_TESTNET_FAUCET_RPC_URL=https://sepolia.base.org",
      "FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS=0x1111111111111111111111111111111111111111",
      "FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS=0x2222222222222222222222222222222222222222",
      "FISH_TESTNET_FAUCET_ETH_AMOUNT=0.0005",
      "FISH_TESTNET_FAUCET_OCEAN_AMOUNT=1000",
      "FISH_TESTNET_FAUCET_USDC_AMOUNT=25",
      "FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS=50",
      "FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS=24",
      "FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS=24"
    ].join("\n")
  );
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const faucet = summary.checks.find((check: { name: string }) => check.name === "Public testnet faucet");

  assert.equal(faucet.state, "ready");
  assert.deepEqual(faucet.findings, []);
});

test("public testnet readiness flags unsafe backup targets", async () => {
  const appEnv = await tempEnv(["FISH_PAID_TOPUPS_PAUSED=true", "FISH_DATA_BACKUP_TARGET=public/backups"].join("\n"));
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const dataHygiene = summary.checks.find((check: { name: string }) => check.name === "Data retention and backups");

  assert.equal(dataHygiene.state, "manual");
  assert.match(dataHygiene.findings.join("\n"), /must not point inside public/);
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

test("operational readiness accepts trusted runner public keys from JSON without exposing key material", async () => {
  const { envLine, keyId } = runnerPublicKeysJsonEnv();
  const appEnv = await tempEnv(["FISH_PAID_TOPUPS_PAUSED=true", "FISH_GUEST_ID_SALT=12345678901234567890123456789012", envLine].join("\n"));
  const oceanEnv = await tempEnv(oceanEnvWithComputeAccess([PROOF_WALLET_ADDRESS], { runnerSigningKeyId: keyId }));
  const result = runReadiness(["--env", appEnv, "--ocean-env", oceanEnv, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /BEGIN PUBLIC KEY/);
  const summary = JSON.parse(result.stdout);
  const operations = summary.checks.find((check: { name: string }) => check.name === "Operational hardening");

  assert.doesNotMatch(operations.findings.join("\n"), /missing trusted runner public key/);
  assert.doesNotMatch(operations.findings.join("\n"), /could not be parsed/);
  assert.doesNotMatch(operations.findings.join("\n"), /signing key id/);
});

test("operational readiness flags invalid trusted runner public key configuration", async () => {
  const appEnv = await tempEnv(
    [
      "FISH_PAID_TOPUPS_PAUSED=true",
      "FISH_GUEST_ID_SALT=12345678901234567890123456789012",
      'FISH_RUNNER_PUBLIC_KEYS_JSON=[{"keyId":"runner-test","publicKeyPem":"not a pem"}]'
    ].join("\n")
  );
  const oceanEnv = await tempEnv(oceanEnvWithComputeAccess([PROOF_WALLET_ADDRESS], { runnerSigningKeyId: "runner-test" }));
  const result = runReadiness(["--env", appEnv, "--ocean-env", oceanEnv, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const operations = summary.checks.find((check: { name: string }) => check.name === "Operational hardening");

  assert.equal(operations.state, "partial");
  assert.match(operations.findings.join("\n"), /missing trusted runner public key/);
  assert.match(operations.findings.join("\n"), /could not be parsed/);
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

function oceanEnvWithComputeAccess(addresses: string[], options: { runnerSigningKeyId?: string } = {}) {
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
    options.runnerSigningKeyId ? `FISH_RUNNER_SIGNING_KEY_ID=${options.runnerSigningKeyId}` : "",
    options.runnerSigningKeyId ? "FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM=12345678901234567890123456789012" : "",
    `OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS=${JSON.stringify(computeEnvironments)}`
  ]
    .filter(Boolean)
    .join("\n");
}

function runnerPublicKeysJsonEnv(keyId = "runner-test") {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    keyId,
    envLine: `FISH_RUNNER_PUBLIC_KEYS_JSON=${JSON.stringify([{ keyId, publicKeyPem }])}`
  };
}

function runReadiness(args: string[]) {
  return spawnSync(process.execPath, ["scripts/audit-public-testnet-readiness.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}
