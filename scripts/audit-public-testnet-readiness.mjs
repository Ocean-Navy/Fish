#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

const rootEnvPath = option("--env") || ".env.production";
const appEnvOverlayPath = option("--app-env-overlay");
const oceanEnvPath = option("--ocean-env") || ".env.ocean-demo-stack";
const profile = option("--profile") || "public-testnet";
const deriveOceanWebEnvHost = option("--derive-ocean-web-env-host");
const deriveOceanWebEnvProfile = option("--derive-ocean-web-env-profile") || "warm";
const deriveOceanWebEnvScheme = option("--derive-ocean-web-env-scheme") || "http";
const json = hasFlag("--json");
const strict = hasFlag("--strict");
const MAX_FAUCET_DAILY_CLAIMS = 100;
const MAX_FAUCET_ETH_GRANT = 0.001;
const MAX_FAUCET_TEST_OCEAN_GRANT = 10000;
const MAX_FAUCET_TEST_USDC_GRANT = 100;
const MIN_FAUCET_COOLDOWN_HOURS = 1;
const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

if (!["public-testnet", "paid-mainnet"].includes(profile)) {
  console.error(`Unknown readiness profile: ${profile}`);
  console.error("Use --profile public-testnet or --profile paid-mainnet.");
  process.exit(2);
}
if (deriveOceanWebEnvHost && !["warm", "mlx"].includes(deriveOceanWebEnvProfile)) {
  console.error(`Unknown derived Ocean web env profile: ${deriveOceanWebEnvProfile}`);
  console.error("Use --derive-ocean-web-env-profile warm or mlx.");
  process.exit(2);
}
if (deriveOceanWebEnvHost && !["http", "https"].includes(deriveOceanWebEnvScheme)) {
  console.error(`Unknown derived Ocean web env scheme: ${deriveOceanWebEnvScheme}`);
  console.error("Use --derive-ocean-web-env-scheme http or https.");
  process.exit(2);
}

const appEnvBase = readEnvFile(rootEnvPath);
const appEnvOverlay = appEnvOverlayPath ? readEnvFile(appEnvOverlayPath) : {};
const appEnv = { ...appEnvBase, ...appEnvOverlay };
const oceanEnv = readEnvFile(oceanEnvPath);
const derivedOceanWebEnv = deriveOceanWebEnvHost ? buildOceanWebEnv(oceanEnv, deriveOceanWebEnvHost, deriveOceanWebEnvProfile, deriveOceanWebEnvScheme) : null;
const effectiveAppEnv = derivedOceanWebEnv ? { ...appEnv, ...derivedOceanWebEnv.env } : appEnv;
const checks = [
  checkPublicWeb(effectiveAppEnv, rootEnvPath, appEnvOverlayPath),
  checkOceanDemo(oceanEnv, oceanEnvPath),
  checkBatchDishes(effectiveAppEnv),
  checkPayments(effectiveAppEnv, profile),
  checkTestnetFaucet(effectiveAppEnv),
  checkContracts(effectiveAppEnv),
  checkDataHygiene(effectiveAppEnv),
  checkRepositoryHygiene(),
  checkOperations(effectiveAppEnv, oceanEnv, derivedOceanWebEnv),
  checkRealOncomputeProof(oceanEnv)
];

const summary = {
  checkedAt: new Date().toISOString(),
  profile,
  strict,
  env: {
    app: rootEnvPath,
    appOverlay: appEnvOverlayPath
      ? {
          configured: true,
          path: appEnvOverlayPath
        }
      : {
          configured: false
        },
    ocean: oceanEnvPath,
    oceanWebEnv: derivedOceanWebEnv
      ? {
          derived: true,
          host: deriveOceanWebEnvHost,
          profile: deriveOceanWebEnvProfile
        }
      : {
          derived: false
        }
  },
  totals: checks.reduce(
    (acc, check) => {
      acc[check.state] += 1;
      return acc;
    },
    { ready: 0, partial: 0, blocked: 0, manual: 0 }
  ),
  checks
};

if (json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printSummary(summary);
}

process.exitCode = checks.some((check) => check.state === "blocked") || (strict && checks.some((check) => check.state !== "ready")) ? 1 : 0;

function checkPublicWeb(env, path, overlayPath) {
  const findings = [];
  if (!existsSync(path)) findings.push(`Missing ${path}; copy .env.production.example before public testing.`);
  if (overlayPath && !existsSync(overlayPath)) findings.push(`Missing app env overlay ${overlayPath}; private app settings cannot be audited.`);
  if (!safeSecret(env.FISH_ADMIN_TOKEN)) findings.push("FISH_ADMIN_TOKEN is missing or still a placeholder.");
  const route = normalizeChatRoute(env.FISH_CHAT_ROUTE || env.FISH_CHAT_BACKEND);
  const paused = truthy(env.FISH_CHAT_PAUSED) || truthy(env.FISH_ROUTER_PAUSED);
  const killSwitch = truthy(env.FISH_ROUTER_KILL_SWITCH) || truthy(env.FISH_CHAT_KILL_SWITCH);

  if (killSwitch) findings.push("FISH_ROUTER_KILL_SWITCH is enabled.");
  if (paused) findings.push("FISH_CHAT_PAUSED is enabled.");
  if (!paused && !killSwitch) findings.push(...checkSelectedChatRoute(env, route));

  const routeBroken = findings.some((finding) => finding.startsWith("Selected chat route"));
  return result("Public web env", routeBroken ? "blocked" : findings.length ? "partial" : "ready", findings);
}

function checkOceanDemo(env, path) {
  const findings = [];
  if (!existsSync(path)) findings.push(`Missing ${path}; Ocean Node proof stack cannot be audited.`);
  if (!safeSecret(env.OCEAN_WORKLOAD_ADAPTER_API_KEY)) findings.push("OCEAN_WORKLOAD_ADAPTER_API_KEY is missing or weak.");
  if (!safeSecret(env.OCEAN_NODE_PRIVATE_KEY)) findings.push("OCEAN_NODE_PRIVATE_KEY is missing.");
  if (!safeSecret(env.OCEAN_PROOF_PRIVATE_KEY) && !safeSecret(env.OCEAN_PROOF_MNEMONIC)) findings.push("OCEAN proof wallet is missing.");
  if (!env.FISH_OCEAN_COMPUTE_ENV_ID) findings.push("FISH_OCEAN_COMPUTE_ENV_ID is missing.");
  findings.push(...checkFreeComputeAccess(env));
  if (publicBind(env.OCEAN_NODE_HTTP_BIND)) findings.push("OCEAN_NODE_HTTP_BIND is public.");
  if (publicBind(env.OCEAN_WORKLOAD_ADAPTER_BIND)) findings.push("OCEAN_WORKLOAD_ADAPTER_BIND is public.");
  if (publicBind(env.OCEAN_NODE_P2P_BIND)) findings.push("OCEAN_NODE_P2P_BIND is public; use only when intentionally joining P2P.");
  const compose = dockerComposeConfig(path);
  if (!compose.ok) findings.push(`Ocean demo compose config failed: ${compose.error}`);
  return result("GPU/Ocean demo stack", findings.length ? "partial" : "ready", findings);
}

function checkBatchDishes(env) {
  const findings = [];
  if (!env.FISH_OCEAN_BATCH_ENDPOINT) findings.push("FISH_OCEAN_BATCH_ENDPOINT is missing.");
  if (!safeSecret(env.FISH_OCEAN_BATCH_API_KEY)) findings.push("FISH_OCEAN_BATCH_API_KEY is missing or weak.");
  if (!env.FISH_OCEAN_BATCH_PROVIDER_ID) findings.push("FISH_OCEAN_BATCH_PROVIDER_ID is missing.");
  if (!truthy(env.FISH_OCEAN_BATCH_PRIVATE_PAYLOAD)) findings.push("FISH_OCEAN_BATCH_PRIVATE_PAYLOAD is false; public receipts still work, but user-facing dish artifacts stay generic.");
  if (number(env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD) <= 0) findings.push("FISH_OCEAN_BATCH_DAILY_BUDGET_USD must be positive.");
  return result("Ocean batch dishes", findings.length ? "partial" : "ready", findings);
}

function checkPayments(env, profile) {
  const blockers = [];
  const stripeSecretKey = String(env.FISH_STRIPE_SECRET_KEY || "").trim();
  const stripeSecretsConfigured = safeSecret(stripeSecretKey) && safeSecret(env.FISH_STRIPE_WEBHOOK_SECRET);
  const stripePublicAppUrlConfigured = publicHttpsAppUrl(env.FISH_PUBLIC_APP_URL || env.NEXT_PUBLIC_FISH_APP_URL);
  const hasStripe = stripeSecretsConfigured && stripePublicAppUrlConfigured;
  const usdcConfig = usdcCheckoutConfig(env);
  const hasUsdc = usdcConfig.configured;
  const paidTopupsPaused = truthy(env.FISH_PAID_TOPUPS_PAUSED);
  if (!env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS) blockers.push("FISH_MAX_OUTSTANDING_PREPAID_CREDITS is missing; paid top-ups must stay blocked.");
  if (!hasStripe && !hasUsdc) blockers.push("Neither Stripe nor USDC checkout is fully configured.");
  if (stripeSecretsConfigured && !stripePublicAppUrlConfigured) blockers.push("FISH_PUBLIC_APP_URL or NEXT_PUBLIC_FISH_APP_URL must be a public HTTPS origin for Stripe checkout.");
  if (profile === "paid-mainnet" && truthy(env.FISH_STRIPE_TEST_MODE_ALLOWED)) {
    blockers.push("FISH_STRIPE_TEST_MODE_ALLOWED must be false for paid-mainnet readiness.");
  }
  if (profile === "paid-mainnet" && stripeSecretsConfigured && !stripeLiveModeKey(stripeSecretKey)) {
    blockers.push("FISH_STRIPE_SECRET_KEY must use a live-mode Stripe secret or restricted key for paid-mainnet readiness.");
  }
  if (usdcConfig.touched && !usdcConfig.receiveAddressConfigured) blockers.push("FISH_USDC_RECEIVE_ADDRESS must be a valid non-zero Base mainnet receive address for USDC checkout.");
  if (usdcConfig.touched && !usdcConfig.rpcConfigured) blockers.push("FISH_USDC_RPC_URL must be an HTTP(S) Base mainnet RPC URL for USDC checkout.");
  if (usdcConfig.touched && !usdcConfig.chainConfigured) blockers.push("FISH_USDC_CHAIN_ID must be Base mainnet 8453 for paid USDC checkout.");
  if (usdcConfig.touched && !usdcConfig.tokenConfigured) blockers.push(`FISH_USDC_TOKEN_ADDRESS must be canonical Base USDC ${BASE_USDC_ADDRESS}.`);
  if (!publicCareUrl(env.FISH_BILLING_SUPPORT_URL)) blockers.push("FISH_BILLING_SUPPORT_URL is missing or not a public HTTP(S)/mailto URL.");
  if (!publicCareUrl(env.FISH_BILLING_REFUND_POLICY_URL)) blockers.push("FISH_BILLING_REFUND_POLICY_URL is missing or not a public HTTP(S)/mailto URL.");

  if (profile === "public-testnet" && paidTopupsPaused) {
    const findings = blockers.length
      ? [...blockers, "Paid top-ups are paused, so these payment gaps do not block a no-real-money public testnet."]
      : ["Paid top-ups are configured but intentionally paused for public testnet."];
    return result("Payments/mainnet checkout", "manual", findings);
  }

  if (paidTopupsPaused) blockers.push("FISH_PAID_TOPUPS_PAUSED is enabled; paid checkout cannot launch until this is intentionally removed.");
  if (!paidTopupsPaused && blockers.length) blockers.push("Set FISH_PAID_TOPUPS_PAUSED=true until the above payment blockers are cleared.");
  return result("Payments/mainnet checkout", blockers.length ? "blocked" : "ready", blockers);
}

function checkTestnetFaucet(env) {
  const findings = [];
  if (!truthy(env.FISH_TESTNET_FAUCET_ENABLED)) return result("Public testnet faucet", "manual", ["Faucet is disabled, which is safe before a public test."]);
  if (!truthy(env.FISH_TRUST_PROXY_HEADERS)) findings.push("FISH_TRUST_PROXY_HEADERS must be true before enabling the public faucet IP cooldown.");
  if (!safeSecret(env.FISH_PROXY_HEADER_SECRET)) findings.push("FISH_PROXY_HEADER_SECRET is missing or weak; nginx/private proxy must sign trusted client IP headers.");
  if (env.FISH_TESTNET_FAUCET_CHAIN_ID !== "84532") findings.push("Faucet must stay on Base Sepolia.");
  if (!safeSecret(env.FISH_TESTNET_FAUCET_PRIVATE_KEY)) findings.push("FISH_TESTNET_FAUCET_PRIVATE_KEY is missing.");
  if (!env.FISH_TESTNET_FAUCET_RPC_URL) findings.push("FISH_TESTNET_FAUCET_RPC_URL is missing.");
  if (!address(env.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS)) findings.push("Test OCEAN token address is missing.");
  if (!address(env.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS)) findings.push("Test USDC token address is missing.");
  const dailyClaims = number(env.FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS);
  const ethGrant = number(env.FISH_TESTNET_FAUCET_ETH_AMOUNT);
  const oceanGrant = number(env.FISH_TESTNET_FAUCET_OCEAN_AMOUNT);
  const usdcGrant = number(env.FISH_TESTNET_FAUCET_USDC_AMOUNT);
  const walletCooldownHours = number(env.FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS);
  const ipCooldownHours = number(env.FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS);
  if (dailyClaims <= 0) findings.push("Faucet daily claim cap must be positive.");
  if (dailyClaims > MAX_FAUCET_DAILY_CLAIMS) findings.push(`Faucet daily claim cap is too high for public testing; keep FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS <= ${MAX_FAUCET_DAILY_CLAIMS}.`);
  if (ethGrant <= 0) findings.push("Faucet ETH grant must be positive.");
  if (ethGrant > MAX_FAUCET_ETH_GRANT) findings.push(`Faucet ETH grant is too high for public testing; keep FISH_TESTNET_FAUCET_ETH_AMOUNT <= ${MAX_FAUCET_ETH_GRANT}.`);
  if (oceanGrant <= 0) findings.push("Faucet Test OCEAN grant must be positive.");
  if (oceanGrant > MAX_FAUCET_TEST_OCEAN_GRANT) findings.push(`Faucet Test OCEAN grant is too high for public testing; keep FISH_TESTNET_FAUCET_OCEAN_AMOUNT <= ${MAX_FAUCET_TEST_OCEAN_GRANT}.`);
  if (usdcGrant <= 0) findings.push("Faucet Test USDC grant must be positive.");
  if (usdcGrant > MAX_FAUCET_TEST_USDC_GRANT) findings.push(`Faucet Test USDC grant is too high for public testing; keep FISH_TESTNET_FAUCET_USDC_AMOUNT <= ${MAX_FAUCET_TEST_USDC_GRANT}.`);
  if (walletCooldownHours < MIN_FAUCET_COOLDOWN_HOURS) findings.push(`Wallet cooldown is too low; keep FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS >= ${MIN_FAUCET_COOLDOWN_HOURS}.`);
  if (ipCooldownHours < MIN_FAUCET_COOLDOWN_HOURS) findings.push(`IP cooldown is too low; keep FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS >= ${MIN_FAUCET_COOLDOWN_HOURS}.`);
  return result("Public testnet faucet", findings.length ? "partial" : "ready", findings);
}

function checkContracts(env) {
  const findings = [];
  const chainId = String(env.FISH_CONTRACT_CHAIN_ID || env.NEXT_PUBLIC_FISH_CONTRACT_CHAIN_ID || env.FISH_USDC_CHAIN_ID || "8453").trim();
  const actionsEnabled = truthy(env.FISH_CONTRACT_ACTIONS_ENABLED) || truthy(env.NEXT_PUBLIC_FISH_CONTRACT_ACTIONS_ENABLED);
  const settlementSubmitEnabled = truthy(env.FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED);
  const requiredAddresses = {
    "FISH_CONTRACT_OCEAN_TOKEN_ADDRESS": env.FISH_CONTRACT_OCEAN_TOKEN_ADDRESS || env.NEXT_PUBLIC_FISH_CONTRACT_OCEAN_TOKEN_ADDRESS,
    "FISH_CONTRACT_USDC_TOKEN_ADDRESS": env.FISH_CONTRACT_USDC_TOKEN_ADDRESS || env.NEXT_PUBLIC_FISH_CONTRACT_USDC_TOKEN_ADDRESS || env.FISH_USDC_TOKEN_ADDRESS,
    "FISH_CONTRACT_FISH_TOKEN_ADDRESS": env.FISH_CONTRACT_FISH_TOKEN_ADDRESS || env.NEXT_PUBLIC_FISH_CONTRACT_FISH_TOKEN_ADDRESS,
    "FISH_CONTRACT_OCEAN_STAKING_ADDRESS": env.FISH_CONTRACT_OCEAN_STAKING_ADDRESS || env.NEXT_PUBLIC_FISH_CONTRACT_OCEAN_STAKING_ADDRESS,
    "FISH_CONTRACT_CAPACITY_POOL_ADDRESS": env.FISH_CONTRACT_CAPACITY_POOL_ADDRESS || env.NEXT_PUBLIC_FISH_CONTRACT_CAPACITY_POOL_ADDRESS
  };
  const missingAddresses = Object.entries(requiredAddresses)
    .filter(([, value]) => !address(value))
    .map(([key]) => key);

  if (chainId === "8453" && actionsEnabled && !truthy(env.FISH_CONTRACT_MAINNET_WRITES_ALLOWED)) {
    findings.push("Mainnet contract actions are enabled but mainnet write override is not enabled.");
  }
  if (profile === "public-testnet" && actionsEnabled && chainId !== "84532") {
    findings.push("Public testnet contract actions must stay on Base Sepolia.");
  }
  if (truthy(env.FISH_CONTRACT_MAINNET_WRITES_ALLOWED)) {
    findings.push("Mainnet writes are enabled; require audit, multisig ownership, and incident runbook before public use.");
  }
  if (!env.FISH_CONTRACT_RPC_URL) findings.push("FISH_CONTRACT_RPC_URL is missing; contract pages remain read-only/static.");
  if (missingAddresses.length) findings.push(`Required contract addresses are missing or invalid: ${missingAddresses.join(", ")}.`);
  if (settlementSubmitEnabled && !safeSecret(env.FISH_CONTRACT_OPERATOR_PRIVATE_KEY)) {
    findings.push("FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED is true but FISH_CONTRACT_OPERATOR_PRIVATE_KEY is missing.");
  }
  return result("Contract status and staking pages", findings.length ? "manual" : "ready", findings);
}

function checkDataHygiene(env) {
  const findings = [];
  const hasPinnedProofPublicKey = env.FISH_PROVIDER_PROOF_PUBLIC_KEYS_JSON || env.FISH_PROVIDER_PROOF_PUBLIC_KEYS_PATH || env.FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM;
  const hasManagedProofSigningKey = env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID && safeSecret(env.FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM);
  if (!env.FISH_DATA_BACKUP_TARGET) findings.push("No FISH_DATA_BACKUP_TARGET configured; run npm run backup:runtime with a private output path or move ledgers to a database before public scale.");
  if (env.FISH_DATA_BACKUP_TARGET) findings.push(...backupTargetFindings(env.FISH_DATA_BACKUP_TARGET));
  if (!hasPinnedProofPublicKey && !hasManagedProofSigningKey) {
    findings.push("No secret-managed provider proof signing key or pinned provider proof public key configured; local prototype signing key is acceptable only for private tests.");
  }
  if (env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID && !safeSecret(env.FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM)) {
    findings.push("FISH_PROVIDER_PROOF_SIGNING_KEY_ID is set but FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM is missing or weak.");
  }
  if (env.FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM && !env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID) {
    findings.push("FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM is set but FISH_PROVIDER_PROOF_SIGNING_KEY_ID is missing.");
  }
  if (env.FISH_PROVIDER_PROOF_PUBLIC_KEY_ID && env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID && env.FISH_PROVIDER_PROOF_PUBLIC_KEY_ID !== env.FISH_PROVIDER_PROOF_SIGNING_KEY_ID) {
    findings.push("Provider proof public key id does not match provider proof signing key id.");
  }
  return result("Data retention and backups", findings.length ? "manual" : "ready", findings);
}

function checkRepositoryHygiene() {
  const findings = [];
  const tracked = gitTrackedFiles();
  if (!tracked.ok) {
    return result("Repository hygiene", "manual", [`Cannot inspect git tracked files: ${tracked.error}`]);
  }

  const privateTracked = tracked.files.filter(isPrivateTrackedPath);
  if (privateTracked.length) {
    findings.push(`Private runtime or secret paths are tracked: ${privateTracked.slice(0, 12).join(", ")}${privateTracked.length > 12 ? ", ..." : ""}.`);
  }

  const ignoreChecks = [
    ".env.production.private",
    ".env.ocean-demo-stack",
    "contracts/deployments/baseSepolia.local.json",
    "data/fish/accounts.json",
    "data/ocean-batch/receipts/example.json",
    "data/proof/signing-key.json",
    "data/staking/positions.json",
    "data/support/tickets.jsonl",
    "data/provider_allowlist.json",
    "backups/fish.tar.gz",
    "deploy/nginx/auth/.htpasswd"
  ];
  const notIgnored = ignoreChecks.filter((filePath) => !gitCheckIgnored(filePath));
  if (notIgnored.length) {
    findings.push(`Private runtime paths are not ignored: ${notIgnored.join(", ")}.`);
  }

  return result("Repository hygiene", findings.length ? "manual" : "ready", findings);
}

function checkOperations(appEnv, oceanEnv) {
  const findings = [];
  for (const [key, value] of Object.entries({
    HOSTNAME: appEnv.HOSTNAME,
    OCEAN_NODE_HTTP_BIND: oceanEnv.OCEAN_NODE_HTTP_BIND,
    OCEAN_WORKLOAD_ADAPTER_BIND: oceanEnv.OCEAN_WORKLOAD_ADAPTER_BIND,
    FISH_RUNNER_BIND: oceanEnv.FISH_RUNNER_BIND,
    FISH_VLLM_BIND: oceanEnv.FISH_VLLM_BIND
  })) {
    if (publicBind(value) && key !== "HOSTNAME") findings.push(`${key} is public.`);
  }
  if (appEnv.HOSTNAME && appEnv.HOSTNAME !== "0.0.0.0" && appEnv.HOSTNAME !== "127.0.0.1") {
    findings.push("HOSTNAME is unusual for Next standalone; verify nginx/systemd routing.");
  }
  const runnerTrust = trustedRunnerKeyStatus(appEnv);
  if (!safeSecret(appEnv.FISH_GUEST_ID_SALT)) findings.push("FISH_GUEST_ID_SALT is empty; production guest routes fail closed until it is set.");
  if (!runnerTrust.configured) findings.push("Fish web app is missing trusted runner public key configuration.");
  if (runnerTrust.invalidKeyCount) {
    findings.push(`${runnerTrust.invalidKeyCount} Fish runner public key configuration${runnerTrust.invalidKeyCount === 1 ? "" : "s"} could not be parsed as Ed25519.`);
  }
  if (!oceanEnv.FISH_RUNNER_SIGNING_KEY_ID || !safeSecret(oceanEnv.FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM)) findings.push("Fish Runner signing key is missing or weak.");
  if (runnerTrust.configured && oceanEnv.FISH_RUNNER_SIGNING_KEY_ID && !runnerTrust.keyIds.includes(oceanEnv.FISH_RUNNER_SIGNING_KEY_ID)) {
    findings.push("Fish web trusted runner public keys do not include the Fish Runner signing key id.");
  }
  return result("Operational hardening", findings.length ? "partial" : "ready", findings);
}

function checkRealOncomputeProof(env) {
  const findings = [];
  const mode = String(env.OCEAN_WORKLOAD_ADAPTER_MODE || "dry_run").trim();
  const nodeUrl = String(env.NODE_URL || "").trim();
  const rpc = String(env.OCEAN_PROOF_RPC || env.RPC || "").trim();
  const hasWallet = safeSecret(env.OCEAN_PROOF_PRIVATE_KEY) || safeSecret(env.PRIVATE_KEY) || safeSecret(env.OCEAN_PROOF_MNEMONIC) || safeSecret(env.MNEMONIC);
  const hasCli = Boolean(String(env.FISH_OCEAN_CLI_BIN || "").trim() || String(env.OCEAN_CLI_DIR || "").trim());
  const datasetDids = String(env.FISH_OCEAN_DATASET_DIDS || "").trim();
  const paymentToken = String(env.FISH_OCEAN_PAYMENT_TOKEN || "").trim();
  const resources = String(env.FISH_OCEAN_RESOURCES || "").trim();
  const output = String(env.FISH_OCEAN_OUTPUT || "").trim();
  const paidTouched = Boolean(paymentToken || resources);

  if (mode !== "live") findings.push("OCEAN_WORKLOAD_ADAPTER_MODE must be live for external Ocean/Oncompute proof.");
  if (!safeSecret(env.OCEAN_WORKLOAD_ADAPTER_API_KEY)) findings.push("OCEAN_WORKLOAD_ADAPTER_API_KEY is missing or weak.");
  if (!hasWallet) findings.push("Ocean proof wallet is missing; set OCEAN_PROOF_PRIVATE_KEY/OCEAN_PROOF_MNEMONIC in the private adapter env.");
  if (!httpUrl(rpc)) findings.push("OCEAN_PROOF_RPC or RPC must be an HTTP(S) RPC URL.");
  if (!nodeUrl) {
    findings.push("NODE_URL is missing.");
  } else if (looksLocal(nodeUrl)) {
    findings.push("NODE_URL points at a local Ocean Node; this is local proof, not third-party Oncompute demand.");
  }
  if (!datasetDids) findings.push("FISH_OCEAN_DATASET_DIDS is missing; use [] when the first algorithm is self-contained.");
  if (!env.FISH_OCEAN_ALGO_DID) findings.push("FISH_OCEAN_ALGO_DID is missing for official Ocean CLI paid/free external proofs.");
  if (!env.FISH_OCEAN_COMPUTE_ENV_ID) findings.push("FISH_OCEAN_COMPUTE_ENV_ID is missing.");
  if (!hasCli) findings.push("OCEAN_CLI_DIR or FISH_OCEAN_CLI_BIN is missing.");
  if (paidTouched && (!paymentToken || !resources)) findings.push("Paid external jobs require both FISH_OCEAN_PAYMENT_TOKEN and FISH_OCEAN_RESOURCES; leave both empty only for free compute.");
  if (resources && !jsonObject(resources)) findings.push("FISH_OCEAN_RESOURCES must be valid JSON when set.");
  if (output && !jsonObject(output)) findings.push("FISH_OCEAN_OUTPUT must be valid JSON when set.");
  return result("External Oncompute proof", findings.length ? "manual" : "ready", findings);
}

function result(name, state, findings) {
  return { name, state, findings };
}

function printSummary(summary) {
  console.log(`Fish public-testnet readiness (${summary.checkedAt})`);
  console.log(`profile: ${summary.profile}`);
  if (summary.strict) console.log("strict: true");
  console.log(`app env: ${summary.env.app}`);
  if (summary.env.appOverlay.configured) console.log(`app env overlay: ${summary.env.appOverlay.path}`);
  console.log(`ocean env: ${summary.env.ocean}`);
  if (summary.env.oceanWebEnv.derived) {
    console.log(`derived Ocean web env: ${summary.env.oceanWebEnv.profile} via ${summary.env.oceanWebEnv.host}`);
  }
  console.log("");
  for (const check of summary.checks) {
    console.log(`${symbol(check.state)} ${check.name}: ${check.state}`);
    for (const finding of check.findings) {
      console.log(`   - ${finding}`);
    }
  }
  console.log("");
  console.log(`totals: ready=${summary.totals.ready} partial=${summary.totals.partial} blocked=${summary.totals.blocked} manual=${summary.totals.manual}`);
}

function symbol(state) {
  return state === "ready" ? "[ok]" : state === "blocked" ? "[block]" : state === "partial" ? "[partial]" : "[manual]";
}

function buildOceanWebEnv(oceanEnv, host, profile, scheme) {
  const adapterPort = oceanEnv.OCEAN_WORKLOAD_ADAPTER_PORT || "8787";
  const runnerPort = oceanEnv.FISH_RUNNER_PORT || "8088";
  const providerId = oceanEnv.FISH_RUNNER_PROVIDER_ID || (profile === "mlx" ? "ocean-navy-local-mlx" : "ocean-navy-demo-node");
  const model = profile === "mlx" ? oceanEnv.FISH_MLX_MODEL || "mlx-community/Llama-3.2-3B-Instruct-4bit" : oceanEnv.FISH_VLLM_SERVED_MODEL_NAME || "fish-warm-chat";
  const runnerPublicKey = deriveRunnerPublicKeyFromOceanEnv(oceanEnv);

  return {
    env: {
      FISH_OCEAN_BATCH_ENDPOINT: `${scheme}://${host}:${adapterPort}/jobs`,
      FISH_OCEAN_BATCH_API_KEY: oceanEnv.OCEAN_WORKLOAD_ADAPTER_API_KEY || "",
      FISH_OCEAN_BATCH_PROVIDER_ID: providerId,
      FISH_OCEAN_BATCH_DAILY_BUDGET_USD: "5",
      FISH_OCEAN_BATCH_PRIVATE_PAYLOAD: "true",
      FISH_CHAT_ROUTE: "ocean-first",
      FISH_OCEAN_DEMO_VLLM_BASE_URL: `${scheme}://${host}:${runnerPort}/v1`,
      FISH_OCEAN_DEMO_VLLM_API_KEY: oceanEnv.FISH_RUNNER_API_KEY || "",
      FISH_OCEAN_DEMO_VLLM_MODEL: model,
      FISH_OCEAN_DEMO_PROVIDER_ID: providerId,
      FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS: oceanEnv.FISH_RUNNER_PRICE_USD_PER_1K_TOKENS || "0",
      FISH_OCEAN_DEMO_DAILY_BUDGET_USD: "10",
      FISH_RUNNER_PUBLIC_KEY_ID: runnerPublicKey.keyId,
      FISH_RUNNER_PUBLIC_KEY_PEM: runnerPublicKey.publicKeyPem
    }
  };
}

function checkSelectedChatRoute(env, route) {
  if (route === "mock") {
    return ["FISH_CHAT_ROUTE is still mock; this is fine for a preview but not a usable AI test."];
  }

  if (route === "ocean-demo-vllm") {
    const findings = [];
    if (!httpUrl(env.FISH_OCEAN_DEMO_VLLM_BASE_URL)) findings.push("FISH_OCEAN_DEMO_VLLM_BASE_URL is missing or not HTTP(S).");
    if (!safeSecret(env.FISH_OCEAN_DEMO_VLLM_API_KEY)) findings.push("FISH_OCEAN_DEMO_VLLM_API_KEY is missing or weak.");
    if (!env.FISH_OCEAN_DEMO_VLLM_MODEL) findings.push("FISH_OCEAN_DEMO_VLLM_MODEL is missing.");
    if (number(env.FISH_OCEAN_DEMO_DAILY_BUDGET_USD) <= 0) findings.push("FISH_OCEAN_DEMO_DAILY_BUDGET_USD must be positive.");
    return findings.map((finding) => `Selected chat route ocean-demo-vllm is not ready: ${finding}`);
  }

  if (route === "ocean-provider") {
    const findings = [];
    if (!httpUrl(env.FISH_OCEAN_PROVIDER_BASE_URL)) findings.push("FISH_OCEAN_PROVIDER_BASE_URL is missing or not HTTP(S).");
    if (!safeSecret(env.FISH_OCEAN_PROVIDER_API_KEY)) findings.push("FISH_OCEAN_PROVIDER_API_KEY is missing or weak.");
    if (!env.FISH_OCEAN_PROVIDER_MODEL) findings.push("FISH_OCEAN_PROVIDER_MODEL is missing.");
    if (number(env.FISH_OCEAN_PROVIDER_DAILY_BUDGET_USD) <= 0) findings.push("FISH_OCEAN_PROVIDER_DAILY_BUDGET_USD must be positive.");
    return findings.map((finding) => `Selected chat route ocean-provider is not ready: ${finding}`);
  }

  const findings = [];
  if (!httpUrl(env.FISH_EXTERNAL_CHAT_BASE_URL)) findings.push("FISH_EXTERNAL_CHAT_BASE_URL is missing or not HTTP(S).");
  if (!safeSecret(env.FISH_EXTERNAL_CHAT_API_KEY)) findings.push("FISH_EXTERNAL_CHAT_API_KEY is missing or weak.");
  if (!env.FISH_EXTERNAL_CHAT_MODEL) findings.push("FISH_EXTERNAL_CHAT_MODEL is missing.");
  if (number(env.FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD) <= 0) findings.push("FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD must be positive.");
  return findings.map((finding) => `Selected chat route external-fallback is not ready: ${finding}`);
}

function normalizeChatRoute(value) {
  const route = String(value || "").trim().toLowerCase();
  if (
    route === "ocean-demo-vllm" ||
    route === "ocean_demo_vllm" ||
    route === "vllm" ||
    route === "ocean-first" ||
    route === "ocean_first" ||
    route === "hybrid" ||
    route === "ocean-first-hybrid"
  ) {
    return "ocean-demo-vllm";
  }
  if (route === "ocean-provider" || route === "ocean_provider" || route === "selected-ocean-provider" || route === "selected_ocean_provider" || route === "selected-provider") {
    return "ocean-provider";
  }
  if (route === "external" || route === "external-fallback" || route === "external_fallback") {
    return "external-fallback";
  }
  return "mock";
}

function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    }
    out[match[1]] = value;
  }
  return out;
}

function dockerComposeConfig(envPath) {
  if (!existsSync(envPath)) return { ok: false, error: "env file missing" };
  try {
    execFileSync("docker", ["compose", "-f", "deploy/ocean-demo-stack/docker-compose.yml", "--env-file", envPath, "config"], {
      stdio: "ignore"
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "compose_config_failed" };
  }
}

function gitTrackedFiles() {
  try {
    const stdout = execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { ok: true, files: stdout.split("\0").filter(Boolean) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "git_ls_files_failed" };
  }
}

function gitCheckIgnored(filePath) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", filePath], {
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function isPrivateTrackedPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized === ".env.example" || normalized === ".env.production.example") return false;
  if (/^\.env(?:\.|$)/.test(normalized)) return true;
  if (/^contracts\/deployments\/.*\.local\.json$/.test(normalized)) return true;
  if (/^deploy\/nginx\/auth\/\.htpasswd$/.test(normalized)) return true;
  if (/^backups\//.test(normalized)) return true;
  if (/^\.deps\//.test(normalized)) return true;
  if (/^data\/provider_allowlist\.json$/.test(normalized)) return true;
  if (/^data\/(forms|submissions|support|fish|proof|ocean-batch|ocean-workload-adapter|staking)\//.test(normalized)) return true;
  return false;
}

function checkFreeComputeAccess(env) {
  const findings = [];
  const raw = String(env.OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS || "").trim();
  if (!raw) {
    return ["OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS is missing; free compute access cannot be audited."];
  }

  const parsed = readJson(raw);
  if (!parsed.ok) {
    return [`OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS is not valid JSON: ${parsed.error}`];
  }

  const environments = extractComputeEnvironments(parsed.value);
  if (!environments.length) {
    return ["OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS has no compute environments."];
  }

  const selectedId = String(env.FISH_OCEAN_COMPUTE_ENV_ID || "").trim();
  const selected = selectedId ? environments.filter((environment) => environment.id === selectedId) : environments;
  if (selectedId && !selected.length) {
    return [`FISH_OCEAN_COMPUTE_ENV_ID=${selectedId} was not found in OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS.`];
  }

  const proofWallet = deriveProofWalletAddress(env);
  if (proofWallet.error) {
    findings.push(proofWallet.error);
  }

  for (const environment of selected) {
    const label = environment.id ? `Compute environment ${environment.id}` : "Selected compute environment";
    const addresses = Array.isArray(environment.free?.access?.addresses) ? environment.free.access.addresses.map((value) => String(value).trim()).filter(Boolean) : [];
    if (!addresses.length) {
      findings.push(`${label} has empty free.access.addresses; restrict free jobs to the Ocean proof wallet.`);
      continue;
    }
    const invalidAddresses = addresses.filter((value) => !address(value));
    if (invalidAddresses.length) {
      findings.push(`${label} has invalid free.access.addresses entries.`);
    }
    if (proofWallet.address && !addresses.some((value) => value.toLowerCase() === proofWallet.address.toLowerCase())) {
      findings.push(`${label} free.access.addresses does not include the Ocean proof wallet ${proofWallet.address}.`);
    }
  }

  return findings;
}

function extractComputeEnvironments(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (Array.isArray(entry?.environments)) return entry.environments;
    return entry && typeof entry === "object" && entry.id ? [entry] : [];
  });
}

function deriveProofWalletAddress(env) {
  const privateKey = String(env.OCEAN_PROOF_PRIVATE_KEY || "").trim();
  if (privateKey) {
    try {
      return { address: privateKeyToAccount(privateKey).address, error: null };
    } catch {
      return { address: null, error: "OCEAN_PROOF_PRIVATE_KEY is set but cannot derive a proof wallet address for the free compute allowlist check." };
    }
  }

  const mnemonic = String(env.OCEAN_PROOF_MNEMONIC || "").trim();
  if (mnemonic) {
    try {
      return { address: mnemonicToAccount(mnemonic).address, error: null };
    } catch {
      return { address: null, error: "OCEAN_PROOF_MNEMONIC is set but cannot derive a proof wallet address for the free compute allowlist check." };
    }
  }

  return { address: null, error: null };
}

function readJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "parse_failed" };
  }
}

function jsonObject(value) {
  const parsed = readJson(String(value || "").trim());
  return parsed.ok && parsed.value !== null && typeof parsed.value === "object" && !Array.isArray(parsed.value);
}

function backupTargetFindings(value) {
  const target = String(value || "").trim();
  if (!target) return [];
  if (/^(managed-db|runbook):/i.test(target)) return [];

  const findings = [];
  if (!path.isAbsolute(target)) {
    findings.push("FISH_DATA_BACKUP_TARGET should be an absolute private path or managed-db:/runbook: reference; relative paths can be committed or exposed accidentally.");
  }

  const resolved = path.resolve(target);
  const repoRoot = path.resolve(process.cwd());
  const publicDir = path.join(repoRoot, "public");
  const dataDir = path.join(repoRoot, "data");

  if (isInsidePath(resolved, publicDir)) {
    findings.push("FISH_DATA_BACKUP_TARGET must not point inside public/.");
  } else if (isInsidePath(resolved, dataDir)) {
    findings.push("FISH_DATA_BACKUP_TARGET must not point inside data/.");
  } else if (isInsidePath(resolved, repoRoot)) {
    findings.push("FISH_DATA_BACKUP_TARGET should not point inside the repository checkout.");
  }

  if (isInsidePath(resolved, "/tmp") || isInsidePath(resolved, "/var/tmp")) {
    findings.push("FISH_DATA_BACKUP_TARGET points at a temporary directory; use durable private storage before public traffic.");
  }

  return findings;
}

function isInsidePath(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function trustedRunnerKeyStatus(env) {
  const keys = [
    ...trustedRunnerKeysFromJson(env.FISH_RUNNER_PUBLIC_KEYS_JSON),
    ...trustedRunnerKeysFromPath(env.FISH_RUNNER_PUBLIC_KEYS_PATH),
    ...trustedRunnerKeyFromSingleEnv(env)
  ];
  const keyIds = [];
  let trustedKeyCount = 0;
  let invalidKeyCount = 0;

  for (const key of keys) {
    try {
      const publicKey = createPublicKey(key.publicKeyPem);
      if (publicKey.asymmetricKeyType !== "ed25519") {
        throw new Error("unsupported_runner_public_key_type");
      }
      trustedKeyCount += 1;
      keyIds.push(key.keyId);
    } catch {
      invalidKeyCount += 1;
    }
  }

  return {
    configured: trustedKeyCount > 0,
    trustedKeyCount,
    invalidKeyCount,
    keyIds
  };
}

function trustedRunnerKeysFromPath(filePath) {
  const cleaned = String(filePath || "").trim();
  if (!cleaned) return [];
  try {
    return trustedRunnerKeysFromJson(readFileSync(cleaned, "utf8"));
  } catch {
    return [];
  }
}

function trustedRunnerKeyFromSingleEnv(env) {
  const keyId = String(env.FISH_RUNNER_PUBLIC_KEY_ID || "").trim();
  const publicKeyPem = normalizePem(String(env.FISH_RUNNER_PUBLIC_KEY_PEM || "").trim());
  return keyId && publicKeyPem ? [{ keyId, publicKeyPem }] : [];
}

function deriveRunnerPublicKeyFromOceanEnv(env) {
  const keyId = String(env.FISH_RUNNER_SIGNING_KEY_ID || "").trim() || "runner-ocean-navy-demo-ed25519";
  const privateKeyPem = normalizePem(String(env.FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM || "").trim());
  if (!privateKeyPem) {
    return { keyId, publicKeyPem: "" };
  }
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      return { keyId, publicKeyPem: "" };
    }
    const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" });
    return { keyId, publicKeyPem };
  } catch {
    return { keyId, publicKeyPem: "" };
  }
}

function trustedRunnerKeysFromJson(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return [];

  const parsed = readJson(cleaned);
  if (!parsed.ok) return [];

  if (Array.isArray(parsed.value)) {
    return parsed.value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const keyId = String(entry.keyId || "").trim();
      const publicKeyPem = normalizePem(String(entry.publicKeyPem || "").trim());
      return keyId && publicKeyPem ? [{ keyId, publicKeyPem }] : [];
    });
  }

  if (parsed.value && typeof parsed.value === "object") {
    return Object.entries(parsed.value).flatMap(([keyId, publicKeyValue]) => {
      const publicKeyPem = normalizePem(typeof publicKeyValue === "string" ? publicKeyValue.trim() : "");
      return keyId && publicKeyPem ? [{ keyId, publicKeyPem }] : [];
    });
  }

  return [];
}

function normalizePem(value) {
  return value.replaceAll("\\n", "\n");
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function safeSecret(value) {
  const cleaned = String(value || "").trim();
  return cleaned.length >= 24 && !/change-me|replace-with|placeholder|secret/i.test(cleaned);
}

function stripeLiveModeKey(value) {
  return /^(sk|rk)_live_/i.test(String(value || "").trim());
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function publicBind(value) {
  const cleaned = String(value || "").trim();
  return cleaned === "0.0.0.0" || cleaned === "::";
}

function address(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function nonZeroAddress(value) {
  const cleaned = String(value || "").trim();
  return address(cleaned) && cleaned.toLowerCase() !== ZERO_ADDRESS;
}

function usdcCheckoutConfig(env) {
  const receiveAddress = String(env.FISH_USDC_RECEIVE_ADDRESS || "").trim();
  const rpcUrl = String(env.FISH_USDC_RPC_URL || "").trim();
  const chainIdRaw = String(env.FISH_USDC_CHAIN_ID || "").trim();
  const tokenAddress = String(env.FISH_USDC_TOKEN_ADDRESS || BASE_USDC_ADDRESS).trim();
  const parsedChainId = chainIdRaw ? Number(chainIdRaw) : BASE_CHAIN_ID;
  const chainConfigured = Number.isInteger(parsedChainId) && parsedChainId === BASE_CHAIN_ID;
  const tokenConfigured = address(tokenAddress) && tokenAddress.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase();

  return {
    touched: Boolean(receiveAddress || rpcUrl || chainIdRaw || env.FISH_USDC_TOKEN_ADDRESS),
    receiveAddressConfigured: nonZeroAddress(receiveAddress),
    rpcConfigured: httpUrl(rpcUrl),
    chainConfigured,
    tokenConfigured,
    configured: nonZeroAddress(receiveAddress) && httpUrl(rpcUrl) && chainConfigured && tokenConfigured
  };
}

function httpUrl(value) {
  const cleaned = String(value || "").trim();
  return /^https?:\/\/[^/\s]+/i.test(cleaned);
}

function publicCareUrl(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return false;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function publicHttpsAppUrl(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return false;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function looksLocal(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return false;
  if (/^\/p2p\//i.test(cleaned)) return false;
  try {
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host === "ocean-node" ||
      host === "host.docker.internal" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return /(^|[/:])(localhost|127\.0\.0\.1|0\.0\.0\.0|ocean-node|host\.docker\.internal)([/:]|$)/i.test(cleaned);
  }
}
