import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claimTestnetFaucet, getTestnetFaucetConfig, parseTestnetFaucetClaim, summarizeTestnetFaucet } from "./testnetFaucet";

const FAUCET_ENV_KEYS = [
  "FISH_CONTRACT_CHAIN_ID",
  "FISH_CONTRACT_OCEAN_TOKEN_ADDRESS",
  "FISH_CONTRACT_RPC_URL",
  "FISH_CONTRACT_USDC_TOKEN_ADDRESS",
  "FISH_TESTNET_FAUCET_CHAIN_ID",
  "FISH_TESTNET_FAUCET_ENABLED",
  "FISH_TESTNET_FAUCET_ETH_AMOUNT",
  "FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS",
  "FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS",
  "FISH_TESTNET_FAUCET_OCEAN_AMOUNT",
  "FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS",
  "FISH_TESTNET_FAUCET_PRIVATE_KEY",
  "FISH_TESTNET_FAUCET_RPC_URL",
  "FISH_TESTNET_FAUCET_USDC_AMOUNT",
  "FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS",
  "FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS"
] as const;

let activeTempDir: string | null = null;

beforeEach(() => {
  clearFaucetEnv();
});

afterEach(async () => {
  clearFaucetEnv();
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("testnet faucet is disabled by default", async () => {
  const status = await summarizeTestnetFaucet();

  assert.equal(status.enabled, false);
  assert.equal(status.ready, false);
  assert.equal(status.dataState, "unavailable");
  assert.equal(status.reason, "testnet_faucet_disabled");
});

test("testnet faucet claim parser accepts only EVM addresses", () => {
  const valid = parseTestnetFaucetClaim({ walletAddress: "0x1111111111111111111111111111111111111111" });
  const invalid = parseTestnetFaucetClaim({ walletAddress: "not-a-wallet" });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("testnet faucet refuses non-Base-Sepolia config before reading keys", async () => {
  process.env.FISH_TESTNET_FAUCET_ENABLED = "true";
  process.env.FISH_TESTNET_FAUCET_CHAIN_ID = "8453";

  const result = await claimTestnetFaucet("0x1111111111111111111111111111111111111111", "203.0.113.10", {
    claimsPath: await tempClaimsPath()
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "testnet_faucet_base_sepolia_required");
  }
});

test("testnet faucet config derives faucet address without exposing it publicly as a secret", () => {
  process.env.FISH_TESTNET_FAUCET_PRIVATE_KEY = `0x${"11".repeat(32)}`;

  const config = getTestnetFaucetConfig();

  assert.equal(config.faucetPrivateKey, process.env.FISH_TESTNET_FAUCET_PRIVATE_KEY);
  assert.match(config.faucetAddress ?? "", /^0x[a-fA-F0-9]{40}$/);
});

test("testnet faucet reserves a claim before transfers so concurrent requests cannot bypass limits", async () => {
  process.env.FISH_TESTNET_FAUCET_ENABLED = "true";
  process.env.FISH_TESTNET_FAUCET_PRIVATE_KEY = `0x${"11".repeat(32)}`;
  process.env.FISH_TESTNET_FAUCET_RPC_URL = "http://127.0.0.1:8545";
  process.env.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";
  process.env.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS = "0x3333333333333333333333333333333333333333";
  process.env.FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS = "1";

  const claimsPath = await tempClaimsPath();
  let transferSubmissions = 0;
  const submitTransfers = async () => {
    transferSubmissions += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      ethSent: true,
      ethTxHash: `0x${"44".repeat(32)}` as const,
      oceanTxHash: `0x${"55".repeat(32)}` as const,
      usdcTxHash: `0x${"66".repeat(32)}` as const
    };
  };

  const [first, second] = await Promise.all([
    claimTestnetFaucet("0x1111111111111111111111111111111111111111", "203.0.113.10", { claimsPath, submitTransfers }),
    claimTestnetFaucet("0x1111111111111111111111111111111111111111", "203.0.113.10", { claimsPath, submitTransfers })
  ]);

  const results = [first, second];
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.status === 429).length, 1);
  assert.equal(transferSubmissions, 1);

  const ledger = JSON.parse(await readFile(claimsPath, "utf8"));
  assert.equal(ledger.claims.length, 1);
  assert.equal(ledger.claims[0].status, "succeeded");
});

async function tempClaimsPath() {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-testnet-faucet-"));
  return path.join(activeTempDir, "claims.json");
}

function clearFaucetEnv() {
  for (const key of FAUCET_ENV_KEYS) {
    delete process.env[key];
  }
}
