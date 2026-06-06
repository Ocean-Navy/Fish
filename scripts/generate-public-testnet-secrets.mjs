#!/usr/bin/env node
import { generateKeyPairSync, randomBytes } from "node:crypto";

const includeWallets = hasFlag("--include-wallets");
const json = hasFlag("--json");
const runnerKeyId = option("--runner-key-id") || `runner-ocean-navy-${randomSlug()}`;
const providerProofKeyId = option("--provider-proof-key-id") || `fish-proof-${randomSlug()}`;
const backupTarget = option("--backup-target") || "/var/backups/fish";
const batchDailyBudgetUsd = option("--batch-budget-usd") || "5";
const warmDailyBudgetUsd = option("--warm-budget-usd") || "10";
const prepaidCreditCap = option("--prepaid-credit-cap") || "100000";

const runnerKeys = ed25519KeyPair();
const providerProofKeys = ed25519KeyPair();
const wallets = includeWallets
  ? {
      oceanNodePrivateKey: evmPrivateKey(),
      oceanProofPrivateKey: evmPrivateKey(),
      faucetPrivateKey: evmPrivateKey()
    }
  : null;

const payload = {
  generatedAt: new Date().toISOString(),
  warning: "These values include secrets. Paste them into private env files only. Do not commit them.",
  includeWallets,
  appEnv: {
    FISH_ADMIN_TOKEN: token(32),
    FISH_DATA_BACKUP_TARGET: backupTarget,
    FISH_GUEST_ID_SALT: token(32),
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
    FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM: providerProofKeys.privatePem
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
          OCEAN_PROOF_PRIVATE_KEY: wallets.oceanProofPrivateKey,
          FISH_TESTNET_FAUCET_PRIVATE_KEY: wallets.faucetPrivateKey
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
