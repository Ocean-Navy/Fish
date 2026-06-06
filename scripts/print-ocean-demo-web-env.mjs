#!/usr/bin/env node
import { createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const envPath = option("--env") || ".env.ocean-demo-stack";
const profile = option("--profile") || "warm";
const host = option("--host") || "127.0.0.1";
const scheme = option("--scheme") || "http";
const json = hasFlag("--json");
const batchBudgetUsd = option("--batch-budget-usd") || "5";
const warmBudgetUsd = option("--warm-budget-usd") || "10";

if (!["warm", "mlx"].includes(profile)) {
  console.error(`Unknown profile: ${profile}`);
  console.error("Use --profile warm or --profile mlx.");
  process.exit(2);
}

const env = readEnvFile(envPath);
const adapterPort = env.OCEAN_WORKLOAD_ADAPTER_PORT || "8787";
const runnerPort = env.FISH_RUNNER_PORT || "8088";
const providerId = option("--provider-id") || env.FISH_RUNNER_PROVIDER_ID || (profile === "mlx" ? "ocean-navy-local-mlx" : "ocean-navy-demo-node");
const model = option("--model") || (profile === "mlx" ? env.FISH_MLX_MODEL || "mlx-community/Llama-3.2-3B-Instruct-4bit" : env.FISH_VLLM_SERVED_MODEL_NAME || "fish-warm-chat");
const runnerPublicKey = deriveRunnerPublicKey(env);

const appEnv = {
  FISH_OCEAN_BATCH_ENDPOINT: `${scheme}://${host}:${adapterPort}/jobs`,
  FISH_OCEAN_BATCH_API_KEY: env.OCEAN_WORKLOAD_ADAPTER_API_KEY || "",
  FISH_OCEAN_BATCH_PROVIDER_ID: providerId,
  FISH_OCEAN_BATCH_DAILY_BUDGET_USD: batchBudgetUsd,
  FISH_OCEAN_BATCH_PRIVATE_PAYLOAD: "true",
  FISH_CHAT_ROUTE: "ocean-first",
  FISH_OCEAN_DEMO_VLLM_BASE_URL: `${scheme}://${host}:${runnerPort}/v1`,
  FISH_OCEAN_DEMO_VLLM_API_KEY: env.FISH_RUNNER_API_KEY || "",
  FISH_OCEAN_DEMO_VLLM_MODEL: model,
  FISH_OCEAN_DEMO_PROVIDER_ID: providerId,
  FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS: env.FISH_RUNNER_PRICE_USD_PER_1K_TOKENS || "0",
  FISH_OCEAN_DEMO_DAILY_BUDGET_USD: warmBudgetUsd,
  FISH_RUNNER_PUBLIC_KEY_ID: runnerPublicKey.keyId,
  FISH_RUNNER_PUBLIC_KEY_PEM: runnerPublicKey.publicKeyPem
};

const payload = {
  generatedAt: new Date().toISOString(),
  warning: "This output includes adapter and runner API keys. Store it in private web-host env only.",
  sourceEnv: envPath,
  profile,
  host,
  appEnv,
  findings: findings(env, appEnv)
};

if (json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  printEnvBlock(payload);
}

function printEnvBlock(payload) {
  console.log("# Fish Ocean demo web env");
  console.log("# Generated values include private adapter and runner keys. Store in the web host env only.");
  console.log(`# Source: ${payload.sourceEnv}`);
  console.log(`# Profile: ${payload.profile}`);
  console.log("");
  for (const [key, value] of Object.entries(payload.appEnv)) {
    console.log(`${key}=${shellSafeValue(value)}`);
  }
  if (payload.findings.length) {
    console.log("");
    console.log("# Warnings");
    for (const finding of payload.findings) {
      console.log(`# - ${finding}`);
    }
  }
}

function findings(env, appEnv) {
  const items = [];
  if (!existsSync(envPath)) items.push(`Missing ${envPath}; generated defaults may not match the running Ocean demo stack.`);
  if (host === "127.0.0.1" || host === "localhost") items.push("Host is local; use the GPU/Ocean host private IP or DNS name when configuring a separate web VM.");
  if (!safeSecret(appEnv.FISH_OCEAN_BATCH_API_KEY)) items.push("OCEAN_WORKLOAD_ADAPTER_API_KEY is missing or weak.");
  if (!safeSecret(appEnv.FISH_OCEAN_DEMO_VLLM_API_KEY)) items.push("FISH_RUNNER_API_KEY is missing or weak.");
  if (!appEnv.FISH_RUNNER_PUBLIC_KEY_PEM) items.push("Fish Runner signing public key could not be derived; signed runner receipts will not verify in the web app.");
  if (publicBind(env.OCEAN_WORKLOAD_ADAPTER_BIND)) items.push("OCEAN_WORKLOAD_ADAPTER_BIND is public; keep the adapter private or behind a strict allowlist.");
  if (publicBind(env.FISH_RUNNER_BIND)) items.push("FISH_RUNNER_BIND is public; expose Fish Runner only on a private network or through an allowlist.");
  return items;
}

function deriveRunnerPublicKey(env) {
  const keyId = env.FISH_RUNNER_SIGNING_KEY_ID || "runner-ocean-navy-demo-ed25519";
  const privateKeyPem = normalizePem(env.FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM || "");
  if (!privateKeyPem) {
    return { keyId, publicKeyPem: "" };
  }
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      return { keyId, publicKeyPem: "" };
    }
    const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).replaceAll("\n", "\\n");
    return { keyId, publicKeyPem };
  } catch {
    return { keyId, publicKeyPem: "" };
  }
}

function readEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function shellSafeValue(value) {
  const stringValue = String(value ?? "");
  if (/^[A-Za-z0-9_./:@=-]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function safeSecret(value) {
  const cleaned = String(value || "").trim();
  return cleaned.length >= 24 && !/change-me|replace-with|placeholder|secret/i.test(cleaned);
}

function publicBind(value) {
  const cleaned = String(value || "").trim();
  return cleaned === "0.0.0.0" || cleaned === "::";
}

function normalizePem(value) {
  return String(value || "").trim().replaceAll("\\n", "\n");
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}
