#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const rootEnvPath = option("--env") || ".env.production";
const oceanEnvPath = option("--ocean-env") || ".env.ocean-demo-stack";
const json = hasFlag("--json");

const appEnv = readEnvFile(rootEnvPath);
const oceanEnv = readEnvFile(oceanEnvPath);
const checks = [
  checkPublicWeb(appEnv, rootEnvPath),
  checkOceanDemo(oceanEnv, oceanEnvPath),
  checkBatchDishes(appEnv),
  checkPayments(appEnv),
  checkTestnetFaucet(appEnv),
  checkContracts(appEnv),
  checkDataHygiene(appEnv),
  checkOperations(appEnv, oceanEnv),
  checkRealOncomputeProof(oceanEnv)
];

const summary = {
  checkedAt: new Date().toISOString(),
  env: {
    app: rootEnvPath,
    ocean: oceanEnvPath
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

process.exitCode = checks.some((check) => check.state === "blocked") ? 1 : 0;

function checkPublicWeb(env, path) {
  const findings = [];
  if (!existsSync(path)) findings.push(`Missing ${path}; copy .env.production.example before public testing.`);
  if (!safeSecret(env.FISH_ADMIN_TOKEN)) findings.push("FISH_ADMIN_TOKEN is missing or still a placeholder.");
  if (env.FISH_CHAT_ROUTE === "mock") findings.push("FISH_CHAT_ROUTE is still mock; this is fine for a preview but not a usable AI test.");
  if (truthy(env.FISH_CHAT_PAUSED)) findings.push("FISH_CHAT_PAUSED is enabled.");
  return result("Public web env", findings.length ? "partial" : "ready", findings);
}

function checkOceanDemo(env, path) {
  const findings = [];
  if (!existsSync(path)) findings.push(`Missing ${path}; Ocean Node proof stack cannot be audited.`);
  if (!safeSecret(env.OCEAN_WORKLOAD_ADAPTER_API_KEY)) findings.push("OCEAN_WORKLOAD_ADAPTER_API_KEY is missing or weak.");
  if (!safeSecret(env.OCEAN_NODE_PRIVATE_KEY)) findings.push("OCEAN_NODE_PRIVATE_KEY is missing.");
  if (!safeSecret(env.OCEAN_PROOF_PRIVATE_KEY) && !safeSecret(env.OCEAN_PROOF_MNEMONIC)) findings.push("OCEAN proof wallet is missing.");
  if (!env.FISH_OCEAN_COMPUTE_ENV_ID) findings.push("FISH_OCEAN_COMPUTE_ENV_ID is missing.");
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

function checkPayments(env) {
  const findings = [];
  const hasStripe = safeSecret(env.FISH_STRIPE_SECRET_KEY) && safeSecret(env.FISH_STRIPE_WEBHOOK_SECRET);
  const hasUsdc = address(env.FISH_USDC_RECEIVE_ADDRESS) && env.FISH_USDC_RPC_URL;
  if (!env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS) findings.push("FISH_MAX_OUTSTANDING_PREPAID_CREDITS is missing; paid top-ups must stay blocked.");
  if (!hasStripe && !hasUsdc) findings.push("Neither Stripe nor USDC checkout is fully configured.");
  if (!truthy(env.FISH_PAID_TOPUPS_PAUSED) && findings.length) findings.push("Set FISH_PAID_TOPUPS_PAUSED=true until the above payment blockers are cleared.");
  return result("Payments/mainnet checkout", findings.length ? "blocked" : "ready", findings);
}

function checkTestnetFaucet(env) {
  const findings = [];
  if (!truthy(env.FISH_TESTNET_FAUCET_ENABLED)) return result("Public testnet faucet", "manual", ["Faucet is disabled, which is safe before a public test."]);
  if (env.FISH_TESTNET_FAUCET_CHAIN_ID !== "84532") findings.push("Faucet must stay on Base Sepolia.");
  if (!safeSecret(env.FISH_TESTNET_FAUCET_PRIVATE_KEY)) findings.push("FISH_TESTNET_FAUCET_PRIVATE_KEY is missing.");
  if (!env.FISH_TESTNET_FAUCET_RPC_URL) findings.push("FISH_TESTNET_FAUCET_RPC_URL is missing.");
  if (!address(env.FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS)) findings.push("Test OCEAN token address is missing.");
  if (!address(env.FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS)) findings.push("Test USDC token address is missing.");
  if (number(env.FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS) <= 0) findings.push("Faucet daily claim cap must be positive.");
  return result("Public testnet faucet", findings.length ? "partial" : "ready", findings);
}

function checkContracts(env) {
  const findings = [];
  if (env.FISH_CONTRACT_CHAIN_ID === "8453" && truthy(env.FISH_CONTRACT_ACTIONS_ENABLED) && !truthy(env.FISH_CONTRACT_MAINNET_WRITES_ALLOWED)) {
    findings.push("Mainnet contract actions are enabled but mainnet write override is not enabled.");
  }
  if (truthy(env.FISH_CONTRACT_MAINNET_WRITES_ALLOWED)) {
    findings.push("Mainnet writes are enabled; require audit, multisig ownership, and incident runbook before public use.");
  }
  if (!env.FISH_CONTRACT_RPC_URL) findings.push("FISH_CONTRACT_RPC_URL is missing; contract pages remain read-only/static.");
  return result("Contract status and staking pages", findings.length ? "manual" : "ready", findings);
}

function checkDataHygiene(env) {
  const findings = [];
  if (!env.FISH_DATA_BACKUP_TARGET) findings.push("No FISH_DATA_BACKUP_TARGET configured; local JSON ledgers need VM volume backups or database migration before public scale.");
  if (!env.FISH_PROVIDER_PROOF_PUBLIC_KEYS_JSON && !env.FISH_PROVIDER_PROOF_PUBLIC_KEYS_PATH && !env.FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM) {
    findings.push("No pinned provider proof public key configured; local prototype signing key is acceptable only for private tests.");
  }
  return result("Data retention and backups", findings.length ? "manual" : "ready", findings);
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
  if (!safeSecret(appEnv.FISH_GUEST_ID_SALT)) findings.push("FISH_GUEST_ID_SALT is empty; set it before a public guest demo.");
  return result("Operational hardening", findings.length ? "partial" : "ready", findings);
}

function checkRealOncomputeProof(env) {
  const findings = [];
  if (!env.FISH_OCEAN_ALGO_DID) findings.push("FISH_OCEAN_ALGO_DID is missing for official Ocean CLI paid/free external proofs.");
  if (!env.FISH_OCEAN_PAYMENT_TOKEN && !looksLocal(env.NODE_URL)) findings.push("FISH_OCEAN_PAYMENT_TOKEN is missing for paid external Oncompute jobs.");
  if (looksLocal(env.NODE_URL)) findings.push("NODE_URL points at a local Ocean Node; this is local proof, not third-party Oncompute demand.");
  return result("External Oncompute proof", findings.length ? "manual" : "ready", findings);
}

function result(name, state, findings) {
  return { name, state, findings };
}

function printSummary(summary) {
  console.log(`Fish public-testnet readiness (${summary.checkedAt})`);
  console.log(`app env: ${summary.env.app}`);
  console.log(`ocean env: ${summary.env.ocean}`);
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
      value = value.slice(1, -1);
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function looksLocal(value) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|ocean-node)(:|\/|$)/i.test(String(value || "").trim());
}
