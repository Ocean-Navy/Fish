#!/usr/bin/env node
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { createRequire } from "node:module";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1024 * 64;
const MAX_CAPTURE_BYTES = 1024 * 512;
const MAX_RESULT_BYTES = readPositiveInt(process.env.FISH_OCEAN_RESULT_MAX_BYTES, 1024 * 1024);
const MAX_RESULT_FILES = readPositiveInt(process.env.FISH_OCEAN_RESULT_MAX_FILES, 128);
const require = createRequire(import.meta.url);

loadEnvFileFromArgs();

const adapterVersion = 1;
const port = readPositiveInt(process.env.OCEAN_WORKLOAD_ADAPTER_PORT, DEFAULT_PORT);
const bindHost = process.env.OCEAN_WORKLOAD_ADAPTER_HOST?.trim() || "127.0.0.1";
const dataDir = path.resolve(process.env.OCEAN_WORKLOAD_ADAPTER_DATA_DIR || path.join(process.cwd(), "data", "ocean-workload-adapter"));
const jobDir = path.join(dataDir, "jobs");
const resultRootDir = path.join(dataDir, "results");

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
      return sendJson(response, 200, healthPayload());
    }
    if (request.method === "GET" && url.pathname === "/config") {
      if (!isAuthorized(request)) {
        return sendJson(response, 401, { error: "unauthorized" });
      }
      return sendJson(response, 200, configPayload());
    }
    if (request.method === "POST" && url.pathname === "/jobs") {
      if (!isAuthorized(request)) {
        return sendJson(response, 401, { error: "unauthorized" });
      }
      const body = await readJsonBody(request);
      const parsed = parseJobRequest(body);
      if (!parsed.ok) {
        return sendJson(response, 400, { error: "invalid_job_request", details: parsed.errors });
      }
      const result = await runAdapterJob(parsed.job);
      return sendJson(response, 200, result);
    }
    return sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    return sendJson(response, 500, {
      error: "adapter_internal_error",
      message: error instanceof Error ? error.message : "Unknown adapter error"
    });
  }
});

server.listen(port, bindHost, () => {
  console.log(`Ocean workload adapter listening on http://${bindHost}:${port}`);
});

function loadEnvFileFromArgs() {
  const args = process.argv.slice(2);
  const index = args.findIndex((arg) => arg === "--env-file" || arg.startsWith("--env-file="));
  if (index === -1) {
    return;
  }
  const value = args[index].includes("=") ? args[index].split("=").slice(1).join("=") : args[index + 1];
  if (!value) {
    throw new Error("--env-file requires a path");
  }
  const envPath = path.resolve(value);
  const raw = readFileSyncCompat(envPath);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const valuePart = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = stripEnvQuotes(valuePart);
  }
}

function readFileSyncCompat(filePath) {
  return String(requireFs().readFileSync(filePath, "utf8"));
}

function requireFs() {
  return require("node:fs");
}

function stripEnvQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function healthPayload() {
  const config = readAdapterConfig();
  return {
    ok: true,
    adapterVersion,
    mode: config.mode,
    liveReady: config.missing.length === 0 && config.mode === "live",
    configuredForFreeCompute: config.freeCompute,
    missing: config.missing,
    warnings: config.warnings
  };
}

function configPayload() {
  const config = readAdapterConfig();
  return {
    adapterVersion,
    mode: config.mode,
    liveReady: config.missing.length === 0 && config.mode === "live",
    selected: publicSelection(config),
    resultLimits: {
      maxBytes: MAX_RESULT_BYTES,
      maxFiles: MAX_RESULT_FILES
    },
    cli: {
      commandMode: config.cliBin ? "direct-binary" : "ocean-cli-repo",
      oceanCliDir: config.oceanCliDir ? redactPath(config.oceanCliDir) : null,
      startCommand: config.freeCompute ? config.startFreeCommand : config.startPaidCommand,
      downloadCommand: config.downloadCommand
    },
    missing: config.missing,
    warnings: config.warnings
  };
}

function publicSelection(config) {
  return {
    nodeUrl: config.nodeUrl || null,
    computeEnvId: config.computeEnvId || null,
    datasetDids: config.datasetDids || null,
    algoDid: config.algoDid ? shortDid(config.algoDid) : null,
    paymentToken: config.paymentToken || null,
    resources: config.resources || null,
    outputConfigured: Boolean(config.output)
  };
}

async function runAdapterJob(job) {
  const config = readAdapterConfig();
  if (config.mode !== "live") {
    return failedOutcome(job, "adapter_dry_run");
  }
  if (config.missing.length) {
    return failedOutcome(job, "adapter_not_configured", { missing: config.missing });
  }

  const startedAt = Date.now();
  await mkdir(jobDir, { recursive: true });
  await mkdir(resultRootDir, { recursive: true });
  const localJobDir = path.join(jobDir, sanitizePathPart(job.jobId));
  const localResultDir = path.join(resultRootDir, sanitizePathPart(job.jobId));
  await mkdir(localJobDir, { recursive: true });
  await mkdir(localResultDir, { recursive: true });

  const start = await startOceanComputeJob(config, job);
  await writeJobArtifact(localJobDir, "start.json", commandAudit(start));
  if (start.timedOut) {
    return failedOutcome(job, "ocean_cli_start_timeout");
  }
  if (start.exitCode !== 0) {
    return failedOutcome(job, "ocean_cli_start_failed");
  }

  const providerJobId = parseProviderJobId(`${start.stdout}\n${start.stderr}`);
  if (!providerJobId) {
    return failedOutcome(job, "ocean_job_id_missing");
  }

  const download = await downloadResultsUntilReady(config, job, providerJobId, localResultDir);
  await writeJobArtifact(localJobDir, "download.json", download.audit);
  if (!download.ok) {
    return failedOutcome(job, download.errorCode, { providerJobId });
  }

  let resultHash;
  try {
    resultHash = await hashDirectory(localResultDir, { maxBytes: MAX_RESULT_BYTES, maxFiles: MAX_RESULT_FILES });
  } catch (error) {
    return failedOutcome(job, resultHashErrorCode(error), { providerJobId });
  }
  const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - startedAt) / 1000));
  const outputTokens = Math.min(job.maxOutputTokens, Math.max(1, Math.ceil(resultHash.bytes / 4)));
  const outputRef = parseOutputRef(download.lastOutput) || `sha256:${resultHash.hash}`;

  return {
    jobId: job.jobId,
    providerJobId,
    status: "succeeded",
    usage: {
      inputTokens: job.estimatedInputTokens,
      outputTokens,
      gpuSeconds: elapsedSeconds,
      items: 1
    },
    cost: {
      amount: readProviderCostUsd(config),
      currency: "USDC"
    },
    outputRef
  };
}

async function startOceanComputeJob(config, job) {
  if (config.freeCompute) {
    const args = [config.datasetDids, config.algoDid, config.computeEnvId];
    if (config.output) {
      args.push(config.output);
    }
    return runOceanCli(config, config.startFreeCommand, args, job.maxRuntimeSeconds * 1000);
  }

  const args = [
    config.datasetDids,
    config.algoDid,
    config.computeEnvId,
    String(job.maxRuntimeSeconds),
    config.paymentToken,
    config.resources
  ];
  if (config.output) {
    args.push(config.output);
  }
  args.push("--accept", "true");
  return runOceanCli(config, config.startPaidCommand, args, job.maxRuntimeSeconds * 1000);
}

async function downloadResultsUntilReady(config, job, providerJobId, outputDir) {
  const timeoutMs = Math.min(job.maxRuntimeSeconds * 1000, readPositiveInt(process.env.FISH_OCEAN_RESULT_TIMEOUT_MS, 900000));
  const intervalMs = readPositiveInt(process.env.FISH_OCEAN_POLL_INTERVAL_MS, 15000);
  const startedAt = Date.now();
  const attempts = [];
  let lastOutput = "";

  while (Date.now() - startedAt <= timeoutMs) {
    const args = renderDownloadArgs(config.downloadArgsTemplate, {
      jobId: providerJobId,
      index: process.env.FISH_OCEAN_RESULT_INDEX?.trim() || "0",
      outputDir
    });
    const result = await runOceanCli(config, config.downloadCommand, args, Math.min(intervalMs, 60000));
    lastOutput = `${result.stdout}\n${result.stderr}`;
    attempts.push(commandAudit(result));
    if (result.exitCode === 0 && (await directoryHasFiles(outputDir))) {
      return { ok: true, audit: { attempts }, lastOutput };
    }
    await sleep(intervalMs);
  }

  return {
    ok: false,
    errorCode: "ocean_results_not_available",
    audit: { attempts },
    lastOutput
  };
}

function runOceanCli(config, command, args, timeoutMs) {
  if (config.cliBin) {
    return runCommand(config.cliBin, [command, ...args], {
      cwd: config.oceanCliDir || process.cwd(),
      env: oceanCliEnv(),
      timeoutMs
    });
  }
  return runCommand("npm", ["run", "cli", "--", command, ...args], {
    cwd: config.oceanCliDir,
    env: oceanCliEnv(),
    timeoutMs
  });
}

function oceanCliEnv() {
  return {
    ...process.env,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    MNEMONIC: process.env.MNEMONIC,
    RPC: process.env.RPC,
    NODE_URL: process.env.NODE_URL
  };
}

function runCommand(command, args, options) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    }, options.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode: 127,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: appendBounded(stderr, Buffer.from(error.message))
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        command,
        args,
        cwd: options.cwd,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
  });
}

function appendBounded(current, chunk) {
  const next = current + chunk.toString("utf8");
  if (next.length <= MAX_CAPTURE_BYTES) {
    return next;
  }
  return next.slice(next.length - MAX_CAPTURE_BYTES);
}

function commandAudit(result) {
  return {
    command: result.command,
    args: result.args.map(redactArg),
    cwd: result.cwd ? redactPath(result.cwd) : null,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdoutTail: redactText(result.stdout).slice(-4000),
    stderrTail: redactText(result.stderr).slice(-4000)
  };
}

function failedOutcome(job, errorCode, extra = {}) {
  return {
    jobId: job.jobId,
    providerJobId: extra.providerJobId || null,
    status: "failed",
    usage: {
      inputTokens: job.estimatedInputTokens,
      outputTokens: 0,
      gpuSeconds: 0,
      items: 0
    },
    cost: {
      amount: 0,
      currency: "USDC"
    },
    outputRef: null,
    errorCode,
    ...(extra.missing ? { missing: extra.missing } : {})
  };
}

function readAdapterConfig() {
  const mode = process.env.OCEAN_WORKLOAD_ADAPTER_MODE?.trim() || "dry_run";
  const nodeUrl = process.env.NODE_URL?.trim() || "";
  const rpc = process.env.RPC?.trim() || "";
  const walletConfigured = Boolean(process.env.PRIVATE_KEY?.trim() || process.env.MNEMONIC?.trim());
  const datasetDids = process.env.FISH_OCEAN_DATASET_DIDS?.trim() || "";
  const algoDid = process.env.FISH_OCEAN_ALGO_DID?.trim() || "";
  const computeEnvId = process.env.FISH_OCEAN_COMPUTE_ENV_ID?.trim() || "";
  const paymentToken = process.env.FISH_OCEAN_PAYMENT_TOKEN?.trim() || "";
  const resources = process.env.FISH_OCEAN_RESOURCES?.trim() || "";
  const output = process.env.FISH_OCEAN_OUTPUT?.trim() || "";
  const cliBin = process.env.FISH_OCEAN_CLI_BIN?.trim() || "";
  const oceanCliDir = process.env.OCEAN_CLI_DIR?.trim() || "";
  const freeCompute = !paymentToken && !resources;
  const adapterApiKey = process.env.OCEAN_WORKLOAD_ADAPTER_API_KEY?.trim() || "";
  const adapterApiKeySafe = isSafeAdapterApiKey(adapterApiKey);
  const missing = [];
  const warnings = [];

  if (mode !== "dry_run" && mode !== "live") {
    warnings.push("Unknown OCEAN_WORKLOAD_ADAPTER_MODE; dry_run is safest until live is selected explicitly.");
  }
  if (mode === "live") {
    if (!adapterApiKeySafe) missing.push("strong OCEAN_WORKLOAD_ADAPTER_API_KEY");
    if (!walletConfigured) missing.push("PRIVATE_KEY or MNEMONIC");
    if (!rpc) missing.push("RPC");
    if (!nodeUrl) missing.push("NODE_URL");
    if (!datasetDids) missing.push("FISH_OCEAN_DATASET_DIDS");
    if (!algoDid) missing.push("FISH_OCEAN_ALGO_DID");
    if (!computeEnvId) missing.push("FISH_OCEAN_COMPUTE_ENV_ID");
    if (!cliBin && !oceanCliDir) missing.push("OCEAN_CLI_DIR or FISH_OCEAN_CLI_BIN");
    if (!cliBin && oceanCliDir && !existsSync(oceanCliDir)) missing.push("existing OCEAN_CLI_DIR");
    if (!freeCompute && (!paymentToken || !resources)) missing.push("FISH_OCEAN_PAYMENT_TOKEN and FISH_OCEAN_RESOURCES");
  }
  if (!adapterApiKeySafe) {
    warnings.push("Set OCEAN_WORKLOAD_ADAPTER_API_KEY to a unique secret with at least 32 characters before exposing /jobs or /config.");
  }
  if (freeCompute && paymentToken) {
    warnings.push("FISH_OCEAN_PAYMENT_TOKEN is set without resources; adapter will not use paid startCompute.");
  }
  if (datasetDids === "[]" && process.env.FISH_OCEAN_STATUS_DATASET_DID?.trim()) {
    warnings.push("Dataset list is empty; status checks may need FISH_OCEAN_STATUS_DATASET_DID if the CLI requires a dataset DID.");
  }

  return {
    mode,
    nodeUrl,
    rpc,
    walletConfigured,
    adapterApiKeyConfigured: adapterApiKeySafe,
    datasetDids,
    algoDid,
    computeEnvId,
    paymentToken,
    resources,
    output,
    freeCompute,
    cliBin,
    oceanCliDir,
    startFreeCommand: process.env.FISH_OCEAN_START_FREE_COMMAND?.trim() || "startFreeCompute",
    startPaidCommand: process.env.FISH_OCEAN_START_PAID_COMMAND?.trim() || "startCompute",
    downloadCommand: process.env.FISH_OCEAN_DOWNLOAD_COMMAND?.trim() || "downloadJobResults",
    downloadArgsTemplate: process.env.FISH_OCEAN_DOWNLOAD_ARGS_TEMPLATE?.trim() || "{jobId} {index} {outputDir}",
    missing,
    warnings
  };
}

function parseJobRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }
  const jobId = readNonEmptyString(body.jobId) || readNonEmptyString(body.idempotencyKey);
  const taskType = readNonEmptyString(body.taskType) || "document_summary";
  const inputRef = readNonEmptyString(body.inputRef);
  const estimatedInputTokens = readInt(body.estimatedInputTokens, 1, 200000);
  const maxOutputTokens = readInt(body.maxOutputTokens, 1, 8192, 512);
  const maxRuntimeSeconds = readInt(body.maxRuntimeSeconds, 1, 3600, 600);
  const maxCostUsd = readNumber(body.maxCostUsd, 0, 100, 1);
  if (!jobId) errors.push("jobId or idempotencyKey is required");
  if (!inputRef || inputRef.length < 8) errors.push("inputRef must be a hash or storage reference");
  if (!estimatedInputTokens) errors.push("estimatedInputTokens must be a positive integer");
  if (!maxOutputTokens) errors.push("maxOutputTokens must be a positive integer");
  if (!maxRuntimeSeconds) errors.push("maxRuntimeSeconds must be a positive integer");
  if (maxCostUsd === null) errors.push("maxCostUsd must be a non-negative number");
  if (errors.length) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    job: {
      jobId,
      taskType,
      inputRef,
      estimatedInputTokens,
      maxOutputTokens,
      maxRuntimeSeconds,
      maxCostUsd
    }
  };
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (body.length > MAX_BODY_BYTES) {
      throw new Error("request body too large");
    }
  }
  return JSON.parse(body || "{}");
}

function isAuthorized(request) {
  const apiKey = process.env.OCEAN_WORKLOAD_ADAPTER_API_KEY?.trim() || "";
  if (!isSafeAdapterApiKey(apiKey)) {
    return false;
  }
  const authorization = request.headers.authorization || "";
  const expected = `Bearer ${apiKey}`;
  return timingSafeStringEqual(authorization, expected);
}

function isSafeAdapterApiKey(apiKey) {
  return apiKey.length >= 32 && apiKey !== "change-me";
}

function timingSafeStringEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

function readNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInt(value, min, max, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function readNumber(value, min, max, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseProviderJobId(output) {
  const patterns = [
    /JobID:\s*([A-Za-z0-9:_./-]+)/i,
    /Job ID:\s*([A-Za-z0-9:_./-]+)/i,
    /jobId["'\s:=]+([A-Za-z0-9:_./-]+)/i,
    /jobId["']?\s*:\s*["']([^"']+)["']/i
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function parseOutputRef(output) {
  const patterns = [
    /outputRef["'\s:=]+(sha256:[A-Fa-f0-9]{32,})/i,
    /outputHash["'\s:=]+(sha256:[A-Fa-f0-9]{32,})/i,
    /sha256:[A-Fa-f0-9]{32,}/i
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
    if (match?.[0]?.startsWith("sha256:")) {
      return match[0].trim();
    }
  }
  return null;
}

function renderDownloadArgs(template, values) {
  return template
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .replaceAll("{jobId}", values.jobId)
        .replaceAll("{index}", values.index)
        .replaceAll("{outputDir}", values.outputDir)
    );
}

async function directoryHasFiles(dir) {
  try {
    const files = await listFiles(dir);
    return files.length > 0;
  } catch {
    return false;
  }
}

async function hashDirectory(dir, limits = null) {
  const files = await listFiles(dir, limits);
  if (!files.length) {
    throw new Error("ocean_results_empty");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for (const file of files.sort()) {
    const relative = path.relative(dir, file);
    const content = await readFile(file);
    bytes += content.length;
    hash.update(relative);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), bytes };
}

async function listFiles(dir, limits = null, state = { fileCount: 0, bytes: 0 }) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, limits, state)));
    } else if (entry.isFile()) {
      const fileStat = await stat(fullPath);
      if (fileStat.size > 0) {
        if (limits) {
          state.fileCount += 1;
          state.bytes += fileStat.size;
          if (state.fileCount > limits.maxFiles) {
            throw new Error("ocean_results_file_limit_exceeded");
          }
          if (state.bytes > limits.maxBytes) {
            throw new Error("ocean_results_size_limit_exceeded");
          }
        }
        files.push(fullPath);
      }
    }
  }
  return files;
}

function resultHashErrorCode(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "ocean_results_file_limit_exceeded" || message === "ocean_results_size_limit_exceeded" || message === "ocean_results_empty") {
    return message;
  }
  return "ocean_results_hash_failed";
}

async function writeJobArtifact(dir, fileName, value) {
  await writeFile(path.join(dir, fileName), JSON.stringify(value, null, 2));
}

function readProviderCostUsd(config) {
  if (config.freeCompute) {
    return 0;
  }
  const configured = Number(process.env.FISH_OCEAN_ADAPTER_PROVIDER_COST_USD);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}

function sanitizePathPart(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
}

function shortDid(value) {
  if (value.length <= 24) {
    return value;
  }
  return `${value.slice(0, 14)}...${value.slice(-8)}`;
}

function redactArg(value) {
  const text = String(value);
  const privateKey = process.env.PRIVATE_KEY?.trim();
  const mnemonic = process.env.MNEMONIC?.trim();
  if (privateKey && text.includes(privateKey)) {
    return text.replaceAll(privateKey, "[redacted-private-key]");
  }
  if (mnemonic && text.includes(mnemonic)) {
    return text.replaceAll(mnemonic, "[redacted-mnemonic]");
  }
  return text;
}

function redactText(value) {
  return redactArg(value);
}

function redactPath(value) {
  return value.replace(process.env.HOME || "", "~");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
