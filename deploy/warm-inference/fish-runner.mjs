import { createServer } from "node:http";
import { createHash, createPrivateKey, randomUUID, sign as signData } from "node:crypto";

const RUNNER_VERSION = 1;
const HOST = process.env.FISH_RUNNER_HOST || "127.0.0.1";
const PORT = Number(process.env.FISH_RUNNER_PORT || "8088");
const RUNNER_ID = process.env.FISH_RUNNER_ID || "runner_ocean_navy_demo";
const PROVIDER_ID = process.env.FISH_RUNNER_PROVIDER_ID || "ocean-navy-demo-node";
const API_KEY = cleanEnv(process.env.FISH_RUNNER_API_KEY);
const VLLM_BASE_URL = cleanEnv(process.env.FISH_RUNNER_VLLM_BASE_URL) || "http://127.0.0.1:8000/v1";
const VLLM_API_KEY = cleanEnv(process.env.FISH_RUNNER_VLLM_API_KEY);
const MODEL_IDS = (process.env.FISH_RUNNER_MODELS || process.env.FISH_VLLM_SERVED_MODEL_NAME || "fish-warm-chat")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const CONTEXT_TOKENS = Number(process.env.FISH_RUNNER_CONTEXT_TOKENS || "4096");
const PRICE_USD_PER_1K_TOKENS = Number(process.env.FISH_RUNNER_PRICE_USD_PER_1K_TOKENS || "0");
const MAX_QUEUE = Number(process.env.FISH_RUNNER_MAX_QUEUE || "2");
const SIGNING_PRIVATE_KEY_PEM = cleanEnv(process.env.FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM)?.replaceAll("\\n", "\n") || null;
const SIGNING_KEY_ID = process.env.FISH_RUNNER_SIGNING_KEY_ID || `${RUNNER_ID}-ed25519`;

let activeRequests = 0;
let lastSmoke = null;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/healthz") {
      return sendJson(response, 200, await healthPayload());
    }
    if (request.method === "GET" && url.pathname === "/models") {
      return sendJson(response, 200, { object: "list", data: await modelPayloads() });
    }
    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      if (!authorize(request, response)) {
        return;
      }
      return handleChat(request, response);
    }
    if (request.method === "POST" && url.pathname === "/receipts/sign") {
      if (!authorize(request, response)) {
        return;
      }
      return handleReceiptSign(request, response);
    }
    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    sendJson(response, 500, {
      error: "fish_runner_internal_error",
      message: error instanceof Error ? error.message : "unknown_error"
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Fish Runner listening on http://${HOST}:${PORT}`);
});

async function handleChat(request, response) {
  if (activeRequests >= MAX_QUEUE) {
    return sendJson(response, 429, {
      error: "runner_queue_full",
      runnerId: RUNNER_ID,
      providerId: PROVIDER_ID
    });
  }

  const input = await readJson(request);
  if (!input || typeof input !== "object" || !Array.isArray(input.messages)) {
    return sendJson(response, 400, { error: "invalid_chat_request" });
  }
  if (input.stream) {
    return sendJson(response, 400, { error: "streaming_not_enabled_in_runner_mvp" });
  }

  const startedAt = new Date();
  const jobId = `job_${randomUUID()}`;
  const routeId = readHeader(request, "x-fish-route-id") || readString(input, ["metadata", "fish_route_id"]) || "ocean-demo-vllm";
  const idempotencyKey = readHeader(request, "x-fish-idempotency-key") || readString(input, ["metadata", "idempotency_key"]) || randomUUID();
  const model = typeof input.model === "string" && input.model.trim() ? input.model.trim() : MODEL_IDS[0];
  const upstreamBody = {
    ...input,
    model,
    stream: false
  };

  activeRequests += 1;
  try {
    const upstream = await fetch(`${VLLM_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: upstreamHeaders(),
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(Number(process.env.FISH_RUNNER_CHAT_TIMEOUT_MS || "60000"))
    });
    const payload = await upstream.json().catch(() => null);
    const completedAt = new Date();
    if (!upstream.ok || !payload || typeof payload !== "object") {
      const receipt = buildRunnerReceipt({
        jobId,
        routeId,
        idempotencyKey,
        model,
        status: "failed",
        startedAt,
        completedAt,
        input,
        outputText: "",
        payload: null,
        firstTokenMs: null
      });
      return sendJson(response, upstream.ok ? 502 : upstream.status, {
        error: "vllm_backend_error",
        fish_runner: receipt
      });
    }

    const outputText = readAssistantText(payload);
    const receipt = buildRunnerReceipt({
      jobId,
      routeId,
      idempotencyKey,
      model: readString(payload, ["model"]) || model,
      status: "succeeded",
      startedAt,
      completedAt,
      input,
      outputText,
      payload,
      firstTokenMs: Date.now() - startedAt.getTime()
    });
    lastSmoke = {
      at: completedAt.toISOString(),
      status: receipt.status,
      model: receipt.model,
      totalMs: receipt.timing.totalMs
    };

    sendJson(response, 200, {
      ...payload,
      fish_runner: receipt
    });
  } finally {
    activeRequests -= 1;
  }
}

async function handleReceiptSign(request, response) {
  const input = await readJson(request);
  const receipt = input && typeof input === "object" && "receipt" in input ? input.receipt : input;
  if (!receipt || typeof receipt !== "object") {
    return sendJson(response, 400, { error: "invalid_receipt" });
  }
  sendJson(response, 200, signReceipt(receipt));
}

async function healthPayload() {
  const models = await modelPayloads();
  const anyWarm = models.some((model) => model.warmState === "warm");
  return {
    runnerVersion: RUNNER_VERSION,
    runnerId: RUNNER_ID,
    providerId: PROVIDER_ID,
    generatedAt: new Date().toISOString(),
    ready: anyWarm && activeRequests < MAX_QUEUE,
    engine: {
      type: "vllm",
      status: anyWarm ? "online" : "offline"
    },
    queue: {
      active: activeRequests,
      max: MAX_QUEUE,
      accepting: activeRequests < MAX_QUEUE
    },
    signing: {
      configured: Boolean(SIGNING_PRIVATE_KEY_PEM),
      keyId: SIGNING_PRIVATE_KEY_PEM ? SIGNING_KEY_ID : null,
      algorithm: SIGNING_PRIVATE_KEY_PEM ? "ed25519" : "none"
    },
    lastSmoke,
    models
  };
}

async function modelPayloads() {
  const probe = await probeVllmModels();
  return MODEL_IDS.map((id) => ({
    id,
    object: "model",
    owned_by: PROVIDER_ID,
    engine: "vllm",
    warmState: probe.ok && probe.modelIds.includes(id) ? "warm" : probe.ok ? "warming" : "offline",
    contextTokens: CONTEXT_TOKENS,
    priceUsdPer1kTokens: PRICE_USD_PER_1K_TOKENS,
    supportedFeatures: ["chat"],
    runnerId: RUNNER_ID,
    providerId: PROVIDER_ID
  }));
}

async function probeVllmModels() {
  try {
    const response = await fetch(`${VLLM_BASE_URL.replace(/\/+$/, "")}/models`, {
      headers: upstreamAuthHeaders(),
      signal: AbortSignal.timeout(Number(process.env.FISH_RUNNER_HEALTH_TIMEOUT_MS || "1500"))
    });
    const payload = await response.json().catch(() => null);
    const data = payload && typeof payload === "object" ? payload.data : null;
    const modelIds = Array.isArray(data)
      ? data.map((entry) => (entry && typeof entry === "object" && typeof entry.id === "string" ? entry.id : null)).filter(Boolean)
      : [];
    return { ok: response.ok, modelIds };
  } catch {
    return { ok: false, modelIds: [] };
  }
}

function buildRunnerReceipt({ jobId, routeId, idempotencyKey, model, status, startedAt, completedAt, input, outputText, payload, firstTokenMs }) {
  const usage = {
    inputTokens: readNumber(payload, ["usage", "prompt_tokens"]) ?? estimateTokens(JSON.stringify(input.messages ?? [])),
    outputTokens: readNumber(payload, ["usage", "completion_tokens"]) ?? estimateTokens(outputText),
    gpuSeconds: Math.max(1, Math.ceil((completedAt.getTime() - startedAt.getTime()) / 1000))
  };
  const unsignedReceipt = {
    runnerReceiptVersion: RUNNER_VERSION,
    jobId,
    routeId,
    idempotencyKey,
    providerId: PROVIDER_ID,
    runnerId: RUNNER_ID,
    model,
    engine: "vllm",
    status,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    usage,
    timing: {
      firstTokenMs,
      totalMs: completedAt.getTime() - startedAt.getTime()
    },
    hashes: {
      requestHash: `sha256:${sha256(JSON.stringify(input.messages ?? []))}`,
      outputHash: `sha256:${sha256(outputText)}`
    }
  };
  const signature = signReceipt(unsignedReceipt);
  return {
    ...unsignedReceipt,
    hashes: {
      ...unsignedReceipt.hashes,
      canonicalReceiptHash: signature.canonicalReceiptHash
    },
    signer: signature.signer,
    signature: signature.signature
  };
}

function signReceipt(receipt) {
  const canonical = stableStringify(stripSignature(receipt));
  const canonicalReceiptHash = `sha256:${sha256(canonical)}`;
  if (!SIGNING_PRIVATE_KEY_PEM) {
    return {
      canonicalReceiptHash,
      signer: {
        keyId: null,
        algorithm: "none"
      },
      signature: null
    };
  }
  const privateKey = createPrivateKey(SIGNING_PRIVATE_KEY_PEM);
  return {
    canonicalReceiptHash,
    signer: {
      keyId: SIGNING_KEY_ID,
      algorithm: "ed25519"
    },
    signature: signData(null, Buffer.from(canonical), privateKey).toString("base64")
  };
}

function stripSignature(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const clone = { ...value };
  delete clone.signature;
  delete clone.signer;
  if (clone.hashes && typeof clone.hashes === "object" && !Array.isArray(clone.hashes)) {
    const hashes = { ...clone.hashes };
    delete hashes.canonicalReceiptHash;
    clone.hashes = hashes;
  }
  return clone;
}

function authorize(request, response) {
  if (!API_KEY) {
    return true;
  }
  const authorization = request.headers.authorization || "";
  if (authorization === `Bearer ${API_KEY}`) {
    return true;
  }
  sendJson(response, 401, { error: "runner_unauthorized" });
  return false;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function upstreamHeaders() {
  return {
    "content-type": "application/json",
    ...upstreamAuthHeaders()
  };
}

function upstreamAuthHeaders() {
  return VLLM_API_KEY ? { authorization: `Bearer ${VLLM_API_KEY}` } : {};
}

function readHeader(request, name) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || null;
}

function readAssistantText(payload) {
  const choices = payload && typeof payload === "object" ? payload.choices : null;
  const first = Array.isArray(choices) ? choices[0] : null;
  const message = first && typeof first === "object" ? first.message : null;
  const content = message && typeof message === "object" ? message.content : null;
  return typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join("\n") : "";
}

function readString(payload, path) {
  const value = readPath(payload, path);
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(payload, path) {
  const value = readPath(payload, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPath(payload, path) {
  let current = payload;
  for (const part of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || "").length / 4));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function cleanEnv(value) {
  const clean = value?.trim();
  return clean ? clean : null;
}
