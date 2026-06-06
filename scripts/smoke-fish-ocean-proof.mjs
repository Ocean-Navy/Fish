#!/usr/bin/env node

const baseUrl = option("--base-url") || process.env.FISH_WEB_BASE_URL || "http://127.0.0.1:3000";
const adminToken = option("--admin-token") || process.env.FISH_ADMIN_TOKEN || "";
const dishId = option("--dish") || process.env.FISH_OCEAN_PROOF_SMOKE_DISH || "docs";
const planId = option("--plan") || process.env.FISH_OCEAN_PROOF_SMOKE_PLAN || "team-api";
const creditGrant = positiveNumber(option("--credit-grant") || process.env.FISH_OCEAN_PROOF_SMOKE_CREDITS, 100000);
const timeoutMs = positiveNumber(option("--timeout-ms") || process.env.FISH_OCEAN_PROOF_SMOKE_TIMEOUT_MS, 120000);
const prompt =
  option("--prompt") ||
  process.env.FISH_OCEAN_PROOF_SMOKE_PROMPT ||
  "Summarize the Fish local Ocean proof path for a public tester in three short bullets.";

if (hasFlag("--help")) {
  console.log(`Usage: scripts/smoke-fish-ocean-proof.mjs [options]

Runs one Fish batch dish through the web app, verifies a non-sample Ocean batch
receipt, verifies /api/ocean/batch/readiness reports proofReady=true, then
checks /proof for conservative public copy.

Options:
  --base-url URL       Fish web base URL. Default: FISH_WEB_BASE_URL or http://127.0.0.1:3000
  --admin-token TOKEN  Admin token for creating the temporary API key. Default: FISH_ADMIN_TOKEN
  --dish ID           Batch dish id. Default: docs
  --plan ID           Temporary key plan. Default: team-api
  --credit-grant N    Temporary key credits. Default: 100000
  --timeout-ms N      Per-request timeout. Default: 120000
  --prompt TEXT       Non-sensitive smoke prompt. Default: public-safe fixed prompt
`);
  process.exit(0);
}

const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
const key = await createTemporaryApiKey();
const dish = await runDish(key);
const readiness = await getJson("/api/ocean/batch/readiness");
const batch = await getJson("/api/ocean/batch/jobs");
const proofHtml = await getText("/proof");

assertDishProof(dish);
assertReadiness(readiness);
assertProofPage(proofHtml);

console.log("Fish Ocean proof smoke passed");
console.log(`web: ${normalizedBaseUrl}`);
console.log(`dish: ${dishId}`);
console.log(`batch receipt: ${dish.fish.batchReceiptId}`);
console.log(`batch source: ${dish.fish.batchSourceState}/${dish.fish.batchAdapterMode}`);
console.log(`batch output: ${dish.fish.batchOutputRef}`);
console.log(`proof gate: dataState=${readiness.dataState}, trafficReady=${readiness.trafficReady}, proofReady=${readiness.proofReady}, nonSampleJobs=${readiness.proof.nonSampleJobs}`);
console.log("proof page: conservative local Ocean proof copy visible");
console.log(`batch summary: dataState=${batch.dataState}, jobs=${batch.jobs}, succeeded=${batch.succeededJobs}, storesPromptOutputText=${batch.storesPromptOutputText}`);

async function createTemporaryApiKey() {
  const headers = { "content-type": "application/json" };
  if (adminToken) {
    headers["x-fish-admin-token"] = adminToken;
  }

  const payload = await postJson("/v1/api_keys", {
    label: `Ocean proof smoke ${new Date().toISOString()}`,
    creditGrant,
    planId
  }, headers);

  if (!payload.key || typeof payload.key !== "string") {
    throw new Error(`temporary_key_missing: ${safeJson(payload.error ?? payload)}`);
  }
  return payload.key;
}

async function runDish(apiKey) {
  return postJson(
    `/api/dishes/${encodeURIComponent(dishId)}/run`,
    {
      prompt,
      max_tokens: 160
    },
    {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    }
  );
}

async function getJson(path) {
  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  return parseResponse(response, path);
}

async function getText(path) {
  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return text;
}

async function postJson(path, body, headers) {
  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  return parseResponse(response, path);
}

async function parseResponse(response, path) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${safeJson(payload?.error ?? payload)}`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${path} returned a non-object JSON payload`);
  }
  return payload;
}

function assertDishProof(payload) {
  const fish = payload.fish;
  if (!fish || typeof fish !== "object" || Array.isArray(fish)) {
    throw new Error("dish response missing fish metadata");
  }
  if (fish.status !== "succeeded") {
    throw new Error(`dish did not succeed: ${fish.status ?? "unknown"}`);
  }
  if (!fish.batchReceiptId || typeof fish.batchReceiptId !== "string") {
    throw new Error("dish response missing batchReceiptId");
  }
  if (fish.batchSourceState === "sample") {
    throw new Error("dish used sample batch path; configure FISH_OCEAN_BATCH_ENDPOINT first");
  }
  if (fish.batchSourceState !== "snapshot" && fish.batchSourceState !== "live") {
    throw new Error(`dish returned unexpected batchSourceState: ${fish.batchSourceState ?? "missing"}`);
  }
  if (fish.batchAdapterMode !== "ocean_http") {
    throw new Error(`dish did not use ocean_http adapter: ${fish.batchAdapterMode ?? "missing"}`);
  }
  if (typeof fish.batchOutputRef !== "string" || !fish.batchOutputRef.startsWith("sha256:")) {
    throw new Error("dish response missing sha256 batchOutputRef");
  }
  if (fish.storesPromptOutputText !== false || fish.storesOutputText !== false) {
    throw new Error("dish response does not confirm prompt/output text is excluded from public proof");
  }
}

function assertReadiness(payload) {
  if (payload.trafficReady !== true || payload.proofReady !== true) {
    throw new Error(`Ocean proof gate is not ready: ${safeJson(payload.blockers ?? payload)}`);
  }
  if (payload.dataState !== "snapshot" && payload.dataState !== "live") {
    throw new Error(`Ocean proof gate returned unexpected dataState: ${payload.dataState ?? "missing"}`);
  }
  if (!payload.proof || payload.proof.hasNonSampleReceipt !== true) {
    throw new Error("Ocean proof gate does not see a non-sample receipt");
  }
}

function assertProofPage(html) {
  if (!html.includes("Local Ocean proof")) {
    throw new Error("/proof does not show the local Ocean proof label");
  }
  if (!html.includes("External paid demand is not claimed yet.")) {
    throw new Error("/proof does not show the external Oncompute demand boundary");
  }
  if (prompt && html.includes(prompt)) {
    throw new Error("/proof rendered the raw smoke prompt");
  }
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid --base-url: ${value}`);
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeJson(value) {
  return JSON.stringify(value, (_key, nested) => {
    if (typeof nested !== "string") return nested;
    if (/fish_sk_|bearer|token|secret|private|api[_-]?key/i.test(nested)) return "[redacted]";
    return nested;
  });
}
