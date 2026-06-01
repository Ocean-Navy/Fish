import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  estimateTokens,
  recordChatUsage,
  releaseFishCreditReservation,
  reserveFishCredits,
  type Account,
  type Ledger
} from "@/lib/fishLedger";
import type { DataState } from "@/lib/types";

const OCEAN_BATCH_DIR = path.join(process.cwd(), "data", "ocean-batch");
const OCEAN_BATCH_RECEIPTS_DIR = path.join(OCEAN_BATCH_DIR, "receipts");
const OCEAN_BATCH_MODEL = "ocean-batch-placeholder";

const batchTaskTypeSchema = z.enum(["document_summary", "structured_extraction", "embeddings", "batch_chat"]);
const batchAdapterModeSchema = z.enum(["sample_success", "sample_failure", "ocean_http"]);
const batchStatusSchema = z.enum(["succeeded", "failed", "timed_out"]);
const pricingStateSchema = z.enum(["prototype_estimate", "provider_verified", "not_applicable"]);
const dataStateSchema = z.enum(["live", "snapshot", "sample", "unavailable"]);

const oceanBatchJobRequestSchema = z
  .object({
    taskType: batchTaskTypeSchema.default("document_summary"),
    inputRef: z.string().trim().min(8).max(200),
    estimatedInputTokens: z.number().int().min(1).max(200000).optional(),
    maxOutputTokens: z.number().int().min(1).max(8192).optional().default(512),
    maxRuntimeSeconds: z.number().int().min(1).max(3600).optional().default(600),
    maxCostUsd: z.number().min(0).max(100).optional().default(1),
    adapterMode: batchAdapterModeSchema.optional().default("sample_success")
  })
  .strict();

export type OceanBatchJobRequestInput = z.infer<typeof oceanBatchJobRequestSchema>;
type OceanBatchJobInput = Omit<OceanBatchJobRequestInput, "estimatedInputTokens"> & { estimatedInputTokens: number };

export type OceanBatchJobContext = {
  ledger: Ledger;
  account: Account;
};

type OceanBatchAdapterOutcome = {
  status: "succeeded" | "failed" | "timed_out";
  providerJobId: string | null;
  outputRef: string | null;
  usage: OceanBatchReceipt["usage"];
  cost: OceanBatchReceipt["cost"];
  errorCode: string | null;
};

export type OceanBatchReceipt = {
  receiptVersion: 1;
  receiptType: "ocean_batch_job_receipt";
  receiptId: string;
  jobId: string;
  providerJobId: string | null;
  providerId: string;
  taskType: z.infer<typeof batchTaskTypeSchema>;
  model: typeof OCEAN_BATCH_MODEL;
  backend: "ocean_batch";
  status: z.infer<typeof batchStatusSchema>;
  sourceState: DataState;
  adapterMode: z.infer<typeof batchAdapterModeSchema>;
  visibility: "public";
  storesPromptOutputText: false;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    gpuSeconds: number;
    items: number;
  };
  cost: {
    userChargeUsd: number;
    providerCostUsd: number;
    pricingState: z.infer<typeof pricingStateSchema>;
  };
  hashes: {
    inputHash: string;
    outputHash: string | null;
    canonicalReceiptHash: string;
  };
  errorCode: string | null;
};

export type OceanBatchSummary = {
  dataState: DataState;
  lastUpdated: string;
  jobs: number;
  succeededJobs: number;
  failedJobs: number;
  timedOutJobs: number;
  tokensProcessed: number;
  providerCostUsd: number;
  budget: OceanBatchBudgetState;
  storesPromptOutputText: false;
  receipts: OceanBatchReceipt[];
  warnings: string[];
};

export type OceanBatchBudgetState = {
  dailyBudgetUsd: number;
  spentUsd: number;
  estimatedCostUsd: number;
  remainingUsd: number;
};

const oceanBatchReceiptSchema: z.ZodType<OceanBatchReceipt> = z.object({
  receiptVersion: z.literal(1),
  receiptType: z.literal("ocean_batch_job_receipt"),
  receiptId: z.string(),
  jobId: z.string(),
  providerJobId: z.string().nullable(),
  providerId: z.string(),
  taskType: batchTaskTypeSchema,
  model: z.literal(OCEAN_BATCH_MODEL),
  backend: z.literal("ocean_batch"),
  status: batchStatusSchema,
  sourceState: dataStateSchema,
  adapterMode: batchAdapterModeSchema,
  visibility: z.literal("public"),
  storesPromptOutputText: z.literal(false),
  createdAt: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    gpuSeconds: z.number().finite().nonnegative(),
    items: z.number().int().nonnegative()
  }),
  cost: z.object({
    userChargeUsd: z.number().finite().nonnegative(),
    providerCostUsd: z.number().finite().nonnegative(),
    pricingState: pricingStateSchema
  }),
  hashes: z.object({
    inputHash: z.string(),
    outputHash: z.string().nullable(),
    canonicalReceiptHash: z.string()
  }),
  errorCode: z.string().nullable()
});

export function parseOceanBatchJobRequest(body: unknown) {
  return oceanBatchJobRequestSchema.safeParse(body);
}

export async function runOceanBatchJob(request: OceanBatchJobRequestInput, context: OceanBatchJobContext) {
  const input = normalizeBatchInput(request);
  const budget = await checkOceanBatchDailyBudget(input.maxCostUsd);
  if (!budget.ok) {
    return {
      ok: false as const,
      status: 429,
      error: "ocean_batch_daily_budget_exceeded",
      budget: budget.state
    };
  }

  const estimatedMaxCredits = Math.max(1, Math.ceil((input.estimatedInputTokens + input.maxOutputTokens) / 1000));
  const reservationResult = await reserveFishCredits({
    ledger: context.ledger,
    account: context.account,
    credits: estimatedMaxCredits,
    reason: "ocean_batch_credit_reserve_before_backend_call"
  });
  if (!reservationResult.ok) {
    return {
      ok: false as const,
      status: reservationResult.status,
      error: reservationResult.error,
      needed: reservationResult.needed,
      available: reservationResult.available
    };
  }

  const startedAt = new Date().toISOString();
  const receiptBase = {
    receiptVersion: 1 as const,
    receiptType: "ocean_batch_job_receipt" as const,
    receiptId: `batch_rcpt_${randomUUID()}`,
    jobId: `batch_job_${randomUUID()}`,
    providerJobId: null as string | null,
    providerId: readBatchProviderId(),
    taskType: input.taskType,
    model: OCEAN_BATCH_MODEL as typeof OCEAN_BATCH_MODEL,
    backend: "ocean_batch" as const,
    sourceState: sourceStateForAdapter(input.adapterMode),
    adapterMode: input.adapterMode,
    visibility: "public" as const,
    storesPromptOutputText: false as const,
    createdAt: startedAt,
    startedAt,
    usage: emptyUsage(input),
    cost: { userChargeUsd: 0, providerCostUsd: 0, pricingState: "not_applicable" as const },
    hashes: {
      inputHash: normalizeHash(input.inputRef),
      outputHash: null as string | null,
      canonicalReceiptHash: ""
    },
    errorCode: null as string | null
  };

  const outcome = input.adapterMode === "ocean_http" ? await runOceanHttpBatchAdapter(input, receiptBase.jobId) : runSampleBatchAdapter(input);
  const receipt = finalizeBatchReceipt({
    ...receiptBase,
    providerJobId: outcome.providerJobId,
    status: outcome.status,
    completedAt: new Date().toISOString(),
    usage: outcome.usage,
    cost: outcome.cost,
    hashes: {
      ...receiptBase.hashes,
      outputHash: outcome.outputRef ? normalizeHash(outcome.outputRef) : null
    },
    errorCode: outcome.errorCode
  });
  await writeBatchReceipt(receipt);

  if (outcome.status !== "succeeded") {
    await releaseFishCreditReservation({
      ledger: context.ledger,
      account: context.account,
      reservation: reservationResult.reservation,
      receiptId: receipt.receiptId,
      reason: "ocean_batch_credit_reserve_release_backend_error"
    });
    return {
      ok: false as const,
      status: outcome.status === "timed_out" ? 504 : 502,
      receipt,
      error: outcome.errorCode ?? "ocean_batch_job_failed"
    };
  }

  const usage = await recordChatUsage({
    ledger: context.ledger,
    account: context.account,
    input: {
      model: OCEAN_BATCH_MODEL,
      messages: [{ role: "user", content: input.inputRef }],
      stream: false,
      max_tokens: input.maxOutputTokens,
      metadata: {
        fish_feature: "docs",
        fish_batch_job_id: receipt.jobId,
        fish_batch_task_type: input.taskType
      }
    },
    model: OCEAN_BATCH_MODEL,
    promptTokens: outcome.usage.inputTokens,
    completionTokens: outcome.usage.outputTokens,
    content: "",
    route: "ocean-provider",
    costState: outcome.cost.pricingState === "provider_verified" ? "provider_verified" : "prototype_estimate",
    status: "succeeded",
    latencyMs: Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt),
    providerCostUsd: outcome.cost.providerCostUsd,
    providerId: receipt.providerId,
    runnerReceipt: null,
    reservation: reservationResult.reservation
  });

  if (!usage.ok) {
    return {
      ok: false as const,
      status: usage.status,
      receipt,
      error: usage.error,
      needed: usage.needed,
      available: usage.available
    };
  }

  return {
    ok: true as const,
    status: 200,
    receipt,
    usageReceipt: usage.receipt,
    creditsRemaining: usage.creditsRemaining,
    budget: await oceanBatchBudgetState(0)
  };
}

export async function summarizeOceanBatchJobs(): Promise<OceanBatchSummary> {
  const receipts = await readBatchReceipts();
  const sorted = receipts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selected = sorted.slice(-20).reverse();
  return {
    dataState: sourceStateSummary(receipts.map((receipt) => receipt.sourceState)),
    lastUpdated: sorted.at(-1)?.createdAt ?? new Date().toISOString(),
    jobs: receipts.length,
    succeededJobs: receipts.filter((receipt) => receipt.status === "succeeded").length,
    failedJobs: receipts.filter((receipt) => receipt.status === "failed").length,
    timedOutJobs: receipts.filter((receipt) => receipt.status === "timed_out").length,
    tokensProcessed: receipts.reduce((sum, receipt) => sum + receipt.usage.totalTokens, 0),
    providerCostUsd: Number(receipts.reduce((sum, receipt) => sum + receipt.cost.providerCostUsd, 0).toFixed(6)),
    budget: await oceanBatchBudgetState(0),
    storesPromptOutputText: false,
    receipts: selected,
    warnings: [
      ...(receipts.length ? [] : ["No Ocean batch jobs have been recorded yet."]),
      ...(receipts.length && receipts.every((receipt) => receipt.sourceState === "sample") ? ["Only sample Ocean batch jobs exist. Configure an Ocean batch endpoint before treating this as live Ocean execution."] : [])
    ]
  };
}

async function checkOceanBatchDailyBudget(estimatedCostUsd: number) {
  const state = await oceanBatchBudgetState(estimatedCostUsd);
  return {
    ok: state.spentUsd + state.estimatedCostUsd <= state.dailyBudgetUsd,
    state
  };
}

async function oceanBatchBudgetState(estimatedCostUsd: number): Promise<OceanBatchBudgetState> {
  const dailyBudgetUsd = readOceanBatchDailyBudgetUsd();
  const spentUsd = await sumOceanBatchProviderCostSince(startOfUtcDayIso());
  const normalizedEstimate = Number(Math.max(0, estimatedCostUsd).toFixed(6));
  return {
    dailyBudgetUsd,
    spentUsd,
    estimatedCostUsd: normalizedEstimate,
    remainingUsd: Number(Math.max(0, dailyBudgetUsd - spentUsd - normalizedEstimate).toFixed(6))
  };
}

async function sumOceanBatchProviderCostSince(sinceIso: string) {
  const receipts = await readBatchReceipts();
  return Number(
    receipts
      .filter((receipt) => receipt.status === "succeeded" && receipt.createdAt >= sinceIso)
      .reduce((sum, receipt) => sum + receipt.cost.providerCostUsd, 0)
      .toFixed(6)
  );
}

function normalizeBatchInput(input: OceanBatchJobRequestInput): OceanBatchJobInput {
  return {
    ...input,
    estimatedInputTokens: input.estimatedInputTokens ?? Math.min(200000, Math.max(1, estimateTokens(input.inputRef)))
  };
}

function runSampleBatchAdapter(input: OceanBatchJobInput): OceanBatchAdapterOutcome {
  if (input.adapterMode === "sample_failure") {
    return batchFailure(input, "sample_ocean_batch_failure");
  }

  const outputTokens = Math.min(input.maxOutputTokens, 256);
  const inputTokens = input.estimatedInputTokens;
  const totalTokens = inputTokens + outputTokens;
  const providerCostUsd = Number(Math.min(input.maxCostUsd, 0.02 + totalTokens * 0.00001).toFixed(6));
  return {
    status: "succeeded",
    providerJobId: `sample_batch_${randomUUID()}`,
    outputRef: normalizeHash(`sample-ocean-batch-output:${input.taskType}:${input.inputRef}`),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      gpuSeconds: Math.min(input.maxRuntimeSeconds, 5),
      items: 1
    },
    cost: {
      userChargeUsd: Number((Math.ceil(totalTokens / 1000) * 0.001).toFixed(6)),
      providerCostUsd,
      pricingState: "prototype_estimate"
    },
    errorCode: null
  };
}

async function runOceanHttpBatchAdapter(input: OceanBatchJobInput, jobId: string): Promise<OceanBatchAdapterOutcome> {
  const endpoint = process.env.FISH_OCEAN_BATCH_ENDPOINT?.trim();
  if (!endpoint) {
    return batchFailure(input, "ocean_batch_endpoint_not_configured");
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: batchHeaders(),
      body: JSON.stringify({
        jobId,
        idempotencyKey: jobId,
        taskType: input.taskType,
        inputRef: input.inputRef,
        estimatedInputTokens: input.estimatedInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        maxRuntimeSeconds: input.maxRuntimeSeconds,
        maxCostUsd: input.maxCostUsd
      }),
      signal: AbortSignal.timeout(Math.min(input.maxRuntimeSeconds * 1000, Number(process.env.FISH_OCEAN_BATCH_TIMEOUT_MS ?? "900000")))
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      return batchFailure(input, response.status === 504 ? "ocean_batch_timeout" : "ocean_batch_http_error", response.status === 504 ? "timed_out" : "failed");
    }
    return batchOutcome(input, payload);
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return batchFailure(input, timeout ? "ocean_batch_timeout" : "ocean_batch_http_error", timeout ? "timed_out" : "failed");
  }
}

function batchOutcome(input: OceanBatchJobInput, payload: Record<string, unknown>): OceanBatchAdapterOutcome {
  const status = readBatchStatus(payload);
  const providerCostUsd = readProviderCostUsd(payload);
  if (providerCostUsd > input.maxCostUsd) {
    return batchFailure(input, "ocean_batch_cost_cap_exceeded");
  }
  if (status !== "succeeded") {
    return {
      ...batchFailure(input, readString(payload, ["errorCode"]) ?? "ocean_batch_job_failed", status),
      providerJobId: readString(payload, ["providerJobId"]) ?? readString(payload, ["jobId"])
    };
  }

  const usage = readBatchUsage(input, payload);
  if (usage.inputTokens > input.estimatedInputTokens || usage.outputTokens > input.maxOutputTokens) {
    return batchFailure(input, "ocean_batch_token_cap_exceeded");
  }

  const outputRef = readString(payload, ["outputRef"]) ?? readString(payload, ["outputHash"]);
  if (!outputRef) {
    return batchFailure(input, "ocean_batch_output_ref_missing");
  }

  return {
    status,
    providerJobId: readString(payload, ["providerJobId"]) ?? readString(payload, ["jobId"]),
    outputRef,
    usage,
    cost: {
      userChargeUsd: Number((Math.ceil(usage.totalTokens / 1000) * 0.001).toFixed(6)),
      providerCostUsd,
      pricingState: "provider_verified"
    },
    errorCode: null
  };
}

function batchFailure(input: OceanBatchJobInput, errorCode: string, status: "failed" | "timed_out" = "failed"): OceanBatchAdapterOutcome {
  return {
    status,
    providerJobId: null,
    outputRef: null,
    usage: status === "timed_out" ? { ...emptyUsage(input), gpuSeconds: input.maxRuntimeSeconds } : emptyUsage(input),
    cost: { userChargeUsd: 0, providerCostUsd: 0, pricingState: "not_applicable" },
    errorCode
  };
}

function emptyUsage(input: OceanBatchJobInput) {
  return {
    inputTokens: input.estimatedInputTokens,
    outputTokens: 0,
    totalTokens: input.estimatedInputTokens,
    gpuSeconds: 0,
    items: 0
  };
}

function finalizeBatchReceipt(receipt: Omit<OceanBatchReceipt, "hashes"> & { hashes: OceanBatchReceipt["hashes"] }): OceanBatchReceipt {
  const canonicalReceiptHash = hashReceipt({
    ...receipt,
    hashes: {
      ...receipt.hashes,
      canonicalReceiptHash: ""
    }
  });
  return {
    ...receipt,
    hashes: {
      ...receipt.hashes,
      canonicalReceiptHash
    }
  };
}

async function writeBatchReceipt(receipt: OceanBatchReceipt) {
  await mkdir(OCEAN_BATCH_RECEIPTS_DIR, { recursive: true });
  await writeFile(path.join(OCEAN_BATCH_RECEIPTS_DIR, `${receipt.createdAt}-${receipt.receiptId}.json`.replaceAll(":", "-")), JSON.stringify(receipt, null, 2));
}

async function readBatchReceipts(): Promise<OceanBatchReceipt[]> {
  try {
    const files = await readdir(OCEAN_BATCH_RECEIPTS_DIR);
    const receipts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const raw = await readFile(path.join(OCEAN_BATCH_RECEIPTS_DIR, file), "utf8");
            const parsed = oceanBatchReceiptSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        })
    );
    return receipts.filter((receipt): receipt is OceanBatchReceipt => receipt !== null);
  } catch {
    return [];
  }
}

function batchHeaders() {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  const apiKey = process.env.FISH_OCEAN_BATCH_API_KEY?.trim();
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function readBatchStatus(payload: Record<string, unknown>): OceanBatchAdapterOutcome["status"] {
  const status = readString(payload, ["status"]);
  if (status === "succeeded" || status === "failed" || status === "timed_out") {
    return status;
  }
  return "failed";
}

function readBatchUsage(input: OceanBatchJobInput, payload: Record<string, unknown>) {
  const inputTokens = Math.max(1, Math.round(readNumber(payload, ["usage", "inputTokens"]) ?? input.estimatedInputTokens));
  const outputTokens = Math.max(0, Math.round(readNumber(payload, ["usage", "outputTokens"]) ?? 0));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    gpuSeconds: Math.max(0, readNumber(payload, ["usage", "gpuSeconds"]) ?? 0),
    items: Math.max(1, Math.round(readNumber(payload, ["usage", "items"]) ?? 1))
  };
}

function readProviderCostUsd(payload: Record<string, unknown>) {
  const currency = readString(payload, ["cost", "currency"])?.toUpperCase();
  const amount = readNumber(payload, ["cost", "providerCostUsd"]) ?? readNumber(payload, ["cost", "amount"]) ?? 0;
  return currency && !["USD", "USDC"].includes(currency) ? 0 : Number(Math.max(0, amount).toFixed(6));
}

function readBatchProviderId() {
  return process.env.FISH_OCEAN_BATCH_PROVIDER_ID?.trim() || "ocean-batch-provider";
}

export function readOceanBatchDailyBudgetUsd() {
  const parsed = Number(process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD ?? "30");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
}

function startOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function sourceStateForAdapter(adapterMode: OceanBatchJobInput["adapterMode"]): DataState {
  return adapterMode.startsWith("sample_") ? "sample" : "snapshot";
}

function sourceStateSummary(states: DataState[]): DataState {
  if (states.includes("live")) {
    return "live";
  }
  if (states.includes("snapshot")) {
    return "snapshot";
  }
  if (states.includes("sample")) {
    return "sample";
  }
  return "sample";
}

function hashReceipt(receipt: OceanBatchReceipt): string {
  return normalizeHash(stableStringify(receipt));
}

function normalizeHash(value: string) {
  if (value.startsWith("sha256:") && value.length > 16) {
    return value;
  }
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: Record<string, unknown>, path: string[]) {
  const result = readPath(value, path);
  return typeof result === "string" && result.trim() ? result.trim() : null;
}

function readNumber(value: Record<string, unknown>, path: string[]) {
  const result = readPath(value, path);
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

function readPath(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
