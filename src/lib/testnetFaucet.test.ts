import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
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
  assert.deepEqual(status.claiming, {
    available: false,
    state: "closed",
    message: "Playground refills are closed right now.",
    action: "You can still connect a wallet and explore the testnet pages."
  });
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

test("testnet faucet status exposes only aggregate daily usage and counts failed attempts", async () => {
  process.env.FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS = "3";
  const claimsPath = await tempClaimsPath();
  await writeFile(
    claimsPath,
    JSON.stringify({
      claims: [
        { status: "succeeded", createdAt: "2026-06-06T01:00:00.000Z" },
        { status: "failed", createdAt: "2026-06-06T02:00:00.000Z" },
        { status: "succeeded", createdAt: "2026-06-05T23:00:00.000Z" }
      ]
    })
  );

  const status = await summarizeTestnetFaucet({
    claimsPath,
    now: new Date("2026-06-06T12:00:00.000Z")
  });

  assert.deepEqual(status.usage, {
    claimsToday: 2,
    remainingToday: 1,
    resetAt: "2026-06-07T00:00:00.000Z",
    latestClaimAt: "2026-06-06T02:00:00.000Z"
  });
});

test("testnet faucet failed attempts count toward wallet cooldown", async () => {
  configureReadyFaucet();
  const walletAddress = "0x1111111111111111111111111111111111111111";
  const now = new Date("2026-06-06T12:00:00.000Z");
  const claimsPath = await tempClaimsPath();
  await writeFile(
    claimsPath,
    JSON.stringify({
      claims: [
        {
          claimId: "faucet_failed_wallet",
          walletHash: hashValue(walletAddress.toLowerCase()),
          walletPrefix: "0x1111...1111",
          ipHash: hashValue("203.0.113.10"),
          status: "failed",
          createdAt: "2026-06-06T11:30:00.000Z",
          chainId: 84532,
          ethTxHash: null,
          oceanTxHash: null,
          usdcTxHash: null,
          failureReason: "testnet_faucet_ocean_balance_low"
        }
      ]
    })
  );

  const result = await claimTestnetFaucet(walletAddress, "203.0.113.10", { claimsPath, now });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 429);
    assert.equal(result.error, "testnet_faucet_wallet_cooldown");
  }
});

test("testnet faucet failed attempts count toward daily cap", async () => {
  configureReadyFaucet();
  process.env.FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS = "1";
  const now = new Date("2026-06-06T12:00:00.000Z");
  const claimsPath = await tempClaimsPath();
  await writeFile(
    claimsPath,
    JSON.stringify({
      claims: [
        {
          claimId: "faucet_failed_daily",
          walletHash: hashValue("0x2222222222222222222222222222222222222222"),
          walletPrefix: "0x2222...2222",
          ipHash: hashValue("203.0.113.20"),
          status: "failed",
          createdAt: "2026-06-06T01:00:00.000Z",
          chainId: 84532,
          ethTxHash: null,
          oceanTxHash: null,
          usdcTxHash: null,
          failureReason: "testnet_faucet_usdc_balance_low"
        }
      ]
    })
  );

  const result = await claimTestnetFaucet("0x3333333333333333333333333333333333333333", "203.0.113.30", { claimsPath, now });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 429);
    assert.equal(result.error, "testnet_faucet_daily_cap_reached");
  }
});

test("testnet faucet status uses setup copy when enabled but not ready", async () => {
  process.env.FISH_TESTNET_FAUCET_ENABLED = "true";
  const status = await summarizeTestnetFaucet();

  assert.equal(status.enabled, true);
  assert.equal(status.ready, false);
  assert.equal(status.dataState, "snapshot");
  assert.equal(status.reason, "testnet_faucet_private_key_required");
  assert.deepEqual(status.claiming, {
    available: false,
    state: "setup",
    message: "Playground refills are being prepared.",
    action: "The faucet needs funding or operator setup before claims open."
  });
});

test("testnet faucet status uses ready copy when configured", async () => {
  process.env.FISH_TESTNET_FAUCET_ENABLED = "true";
  process.env.FISH_TESTNET_FAUCET_CHAIN_ID = "84532";
  process.env.FISH_TESTNET_FAUCET_RPC_URL = "http://127.0.0.1:1";
  process.env.FISH_TESTNET_FAUCET_PRIVATE_KEY = `0x${"11".repeat(32)}`;
  process.env.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";
  const status = await summarizeTestnetFaucet({ claimsPath: await tempClaimsPath() });

  assert.equal(status.ready, true);
  assert.equal(status.claiming.available, true);
  assert.equal(status.claiming.state, "ready");
  assert.equal(status.claiming.message, "Playground refills are open.");
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

function configureReadyFaucet() {
  process.env.FISH_TESTNET_FAUCET_ENABLED = "true";
  process.env.FISH_TESTNET_FAUCET_CHAIN_ID = "84532";
  process.env.FISH_TESTNET_FAUCET_RPC_URL = "http://127.0.0.1:1";
  process.env.FISH_TESTNET_FAUCET_PRIVATE_KEY = `0x${"11".repeat(32)}`;
  process.env.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
