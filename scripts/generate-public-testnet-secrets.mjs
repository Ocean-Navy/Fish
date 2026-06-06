#!/usr/bin/env node
import { generateKeyPairSync, randomBytes } from "node:crypto";

const includeWallets = hasFlag("--include-wallets");
const includeFaucet = hasFlag("--include-faucet");
const json = hasFlag("--json");
const runnerKeyId = option("--runner-key-id") || `runner-ocean-navy-${randomSlug()}`;
const providerProofKeyId = option("--provider-proof-key-id") || `fish-proof-${randomSlug()}`;
const backupTarget = option("--backup-target") || "/var/backups/fish";
const batchDailyBudgetUsd = option("--batch-budget-usd") || "5";
const warmDailyBudgetUsd = option("--warm-budget-usd") || "10";
const prepaidCreditCap = option("--prepaid-credit-cap") || "100000";
const faucetPrivateKeyOption = option("--faucet-private-key");
const faucetOceanAddress = option("--test-ocean-address");
const faucetUsdcAddress = option("--test-usdc-address");
const faucetRpcUrl = option("--faucet-rpc-url") || "https://sepolia.base.org";
const faucetMaxDailyClaims = option("--faucet-max-daily-claims") || "50";
const faucetEthAmount = option("--faucet-eth-amount") || "0.0005";
const faucetOceanAmount = option("--faucet-ocean-amount") || "1000";
const faucetUsdcAmount = option("--faucet-usdc-amount") || "25";
const faucetCooldownHours = option("--faucet-cooldown-hours") || "24";

const runnerKeys = ed25519KeyPair();
const providerProofKeys = ed25519KeyPair();
const wallets = includeWallets
  ? {
      oceanNodePrivateKey: evmPrivateKey(),
      oceanProofPrivateKey: evmPrivateKey(),
      faucetPrivateKey: evmPrivateKey()
    }
  : null;
const faucetPrivateKey = faucetPrivateKeyOption || wallets?.faucetPrivateKey || "";

validateFaucetOptions();

const payload = {
  generatedAt: new Date().toISOString(),
  warning: "These values include secrets. Paste them into private env files only. Do not commit them.",
  includeWallets,
  includeFaucet,
  appEnv: {
    FISH_ADMIN_TOKEN: token(32),
    FISH_DATA_BACKUP_TARGET: backupTarget,
    FISH_GUEST_ID_SALT: token(32),
    FISH_PROXY_HEADER_SECRET: token(32),
    FISH_OCEAN_BATCH_API_KEY: token(32),
    FISH_OCEAN_BATCH_DAILY_BUDGET_USD: batchDailyBudgetUsd,
    FISH_OCEAN_BATCH_PRIVATE_PAYLOAD: "true",
    FISH_OCEAN_DEMO_DAILY_BUDGET_USD: warmDailyBudgetUsd,
    FISH_MAX_OUTSTANDING_PREPAID_CREDITS: prepaidCreditCap,
    FISH_PAID_TOPUPS_PAUSED: "true",
    FISH_BILLING_SUPPORT_URL: "https://op.fish/support",
    FISH_BILLING_REFUND_POLICY_URL: "https://op.fish/refunds",
    FISH_RUNNER_PUBLIC_KEY_ID: runnerKeyId,
    FISH_RUNNER_PUBLIC_KEY_PEM: runnerKeys.publicPem,
    FISH_PROVIDER_PROOF_PUBLIC_KEY_ID: providerProofKeyId,
    FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM: providerProofKeys.publicPem,
    FISH_PROVIDER_PROOF_SIGNING_KEY_ID: providerProofKeyId,
    FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM: providerProofKeys.privatePem,
    ...(faucetPrivateKey
      ? {
          FISH_TESTNET_FAUCET_PRIVATE_KEY: faucetPrivateKey
        }
      : {}),
    ...(includeFaucet
      ? {
          FISH_TRUST_PROXY_HEADERS: "true",
          FISH_TESTNET_FAUCET_ENABLED: "true",
          FISH_TESTNET_FAUCET_RPC_URL: faucetRpcUrl,
          FISH_TESTNET_FAUCET_CHAIN_ID: "84532",
          FISH_TESTNET_FAUCET_CHAIN_NAME: "Base Sepolia",
          FISH_TESTNET_FAUCET_EXPLORER_URL: "https://sepolia.basescan.org",
          FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS: faucetOceanAddress,
          FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS: faucetUsdcAddress,
          FISH_TESTNET_FAUCET_ETH_AMOUNT: faucetEthAmount,
          FISH_TESTNET_FAUCET_OCEAN_AMOUNT: faucetOceanAmount,
          FISH_TESTNET_FAUCET_USDC_AMOUNT: faucetUsdcAmount,
          FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS: faucetMaxDailyClaims,
          FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS: faucetCooldownHours,
          FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS: faucetCooldownHours
        }
      : {})
  },
  oceanEnv: {
    TYPESENSE_API_KEY: token(32),
    OCEAN_NODE_JWT_SECRET: token(32),
    OCEAN_WORKLOAD_ADAPTER_API_KEY: token(32),
    FISH_RUNNER_API_KEY: token(32),
    FISH_VLLM_API_KEY: token(32),
    FISH_RUNNER_SIGNING_KEY_ID: runnerKeyId,
    FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM: runnerKeys.privatePem,
    ...(wallets
      ? {
          OCEAN_NODE_PRIVATE_KEY: wallets.oceanNodePrivateKey,
          OCEAN_PROOF_PRIVATE_KEY: wallets.oceanProofPrivateKey
        }
      : {})
  }
};

if (json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  printEnvBlocks(payload);
}

function printEnvBlocks(value) {
  console.log("# Fish public-testnet secret starter");
  console.log("# Generated values include secrets. Store in private env files only.");
  console.log("# Wallet private keys are omitted by default. Add --include-wallets only for throwaway low-funds test wallets.");
  console.log("# Add --include-faucet with test token addresses only when opening the public tester faucet.");
  console.log("");
  console.log("# Add to .env.production or the web host env");
  printBlock(value.appEnv);
  console.log("");
  console.log("# Add to .env.ocean-demo-stack on the private GPU/Ocean host");
  printBlock(value.oceanEnv);
  console.log("");
  console.log("# Next checks");
  console.log("npm run readiness:public-testnet");
  console.log("npm run backup:runtime -- --dry-run");
}

function printBlock(block) {
  for (const [key, value] of Object.entries(block)) {
    console.log(`${key}=${shellSafeValue(value)}`);
  }
}

function token(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function evmPrivateKey() {
  return `0x${randomBytes(32).toString("hex")}`;
}

function ed25519KeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).replaceAll("\n", "\\n"),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).replaceAll("\n", "\\n")
  };
}

function randomSlug() {
  return randomBytes(4).toString("hex");
}

function shellSafeValue(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function validateFaucetOptions() {
  if (!includeFaucet) return;
  const failures = [];
  if (!evmPrivateKeyValue(faucetPrivateKey)) failures.push("Use --include-wallets or --faucet-private-key 0x... when --include-faucet is set.");
  if (!evmAddress(faucetOceanAddress)) failures.push("Use --test-ocean-address 0x... with --include-faucet.");
  if (!evmAddress(faucetUsdcAddress)) failures.push("Use --test-usdc-address 0x... with --include-faucet.");
  if (!/^https?:\/\//i.test(faucetRpcUrl)) failures.push("Use an HTTP(S) --faucet-rpc-url with --include-faucet.");
  if (failures.length) {
    console.error("Cannot generate faucet env:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(2);
  }
}

function evmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

function evmPrivateKeyValue(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
}
