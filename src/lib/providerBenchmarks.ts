import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";
import { runProviderJob } from "@/lib/providerJobs";
import type { ProviderJobReceipt, ProviderJobRequestInput } from "@/lib/providerJobs";
import type { DataState } from "@/lib/types";

const BENCHMARK_RUNS_DIR = path.join(process.cwd(), "data", "proof", "benchmark-runs");
const ADAPTER_VERSION = "mock-provider-v0";

const benchmarkIdSchema = z.enum(["tiny_smoke", "small_chat", "summary_batch"]);
const benchmarkStatusSchema = z.enum(["succeeded", "failed", "timed_out", "not_allowed"]);
const benchmarkMatrixStatusSchema = z.enum(["succeeded", "failed", "timed_out", "not_allowed", "untested"]);
const signatureStatusSchema = z.enum(["not_required", "valid", "invalid", "missing"]);
const dataStateSchema = z.enum(["live", "snapshot", "sample", "unavailable"]);
const selectedOnlyQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return true;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no"].includes(normalized)) {
      return false;
    }
    if (["true", "1", "yes"].includes(normalized)) {
      return true;
    }
  }
  return value;
}, z.boolean());

const benchmarkDefinitions = [
  {
    benchmarkId: "tiny_smoke",
    title: "Tiny smoke",
    modelClass: "small-chat",
    workloadType: "chat_batch",
    model: "fish-demo-chat",
    inputSizeBucket: "tiny",
    outputSizeBucket: "tiny",
    batchSize: 1,
    inputRef: "sha256:fish-benchmark-tiny-smoke-v1",
    parameters: { maxOutputTokens: 64, temperature: 0 },
    maxRuntimeSeconds: 60,
    maxCostUsd: 0.25
  },
  {
    benchmarkId: "small_chat",
    title: "Small chat",
    modelClass: "small-chat",
    workloadType: "chat_batch",
    model: "fish-demo-chat",
    inputSizeBucket: "small",
    outputSizeBucket: "small",
    batchSize: 1,
    inputRef: "sha256:fish-benchmark-small-chat-v1",
    parameters: { maxOutputTokens: 128, temperature: 0.2 },
    maxRuntimeSeconds: 120,
    maxCostUsd: 0.5
  },
  {
    benchmarkId: "summary_batch",
    title: "Summary batch",
    modelClass: "summary",
    workloadType: "chat_batch",
    model: "fish-demo-chat",
    inputSizeBucket: "medium",
    outputSizeBucket: "small",
    batchSize: 1,
    inputRef: "sha256:fish-benchmark-summary-batch-v1",
    parameters: { maxOutputTokens: 192, temperature: 0.1 },
    maxRuntimeSeconds: 180,
    maxCostUsd: 0.75
  }
] as const;

const benchmarkRequestSchema = z.object({
  providerId: z.string().trim().min(1),
  benchmarkId: benchmarkIdSchema.default("tiny_smoke"),
  adapterMode: z.enum(["mock_success", "mock_failure", "mock_timeout"]).optional().default("mock_success")
}).strict();

const benchmarkQuerySchema = z.object({
  selectedOnly: selectedOnlyQuerySchema,
  provider: z.string().trim().min(1).max(160).optional(),
  providerId: z.string().trim().min(1).max(160).optional(),
  benchmarkId: benchmarkIdSchema.optional(),
  status: benchmarkMatrixStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

type BenchmarkId = z.infer<typeof benchmarkRequestSchema>["benchmarkId"];

export type BenchmarkDefinition = {
  benchmarkId: BenchmarkId;
  title: string;
  modelClass: string;
  workloadType: string;
  model: string;
  inputSizeBucket: string;
  outputSizeBucket: string;
  batchSize: number;
  inputRef: string;
  parameters: ProviderJobRequestInput["parameters"];
  maxRuntimeSeconds: number;
  maxCostUsd: number;
  adapterVersion: typeof ADAPTER_VERSION;
};

export type BenchmarkRequestInput = z.infer<typeof benchmarkRequestSchema>;
export type BenchmarkQuery = z.infer<typeof benchmarkQuerySchema>;

export type BenchmarkStatus = "succeeded" | "failed" | "timed_out" | "not_allowed" | "untested";

export type BenchmarkRun = {
  benchmarkRunVersion: 1;
  benchmarkRunId: string;
  benchmarkId: BenchmarkRequestInput["benchmarkId"];
  providerId: string;
  providerLabel: string;
  modelClass: string;
  workloadType: string;
  model: string;
  inputSizeBucket: string;
  outputSizeBucket: string;
  batchSize: number;
  adapterVersion: typeof ADAPTER_VERSION;
  status: Exclude<BenchmarkStatus, "untested">;
  sourceState: DataState;
  visibility: "public";
  receiptId: string;
  receiptSignatureStatus: ProviderJobReceipt["signatureStatus"];
  jobId: string;
  sampleSize: 1;
  queueSeconds: number | null;
  runtimeSeconds: number;
  gpuSeconds: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerSecond: number;
  providerCostUsd: number;
  costPer1kTokensUsd: number | null;
  createdAt: string;
};

export type BenchmarkMatrixRow = {
  providerId: string;
  providerLabel: string;
  selected: boolean;
  benchmarkId: BenchmarkRequestInput["benchmarkId"];
  title: string;
  modelClass: string;
  workloadType: string;
  inputSizeBucket: string;
  outputSizeBucket: string;
  batchSize: number;
  adapterVersion: typeof ADAPTER_VERSION;
  latestStatus: BenchmarkStatus;
  sampleSize: number;
  successRate: number | null;
  medianQueueSeconds: number | null;
  medianRuntimeSeconds: number | null;
  tokensPerSecond: number | null;
  providerCostUsd: number | null;
  costPer1kTokensUsd: number | null;
  receiptSignatureStatus: ProviderJobReceipt["signatureStatus"] | "missing";
  latestReceiptId: string | null;
  latestReceiptUrl: string | null;
  latestJobId: string | null;
  failureDetail: {
    status: Exclude<BenchmarkStatus, "succeeded" | "untested">;
    receiptUrl: string;
    message: string;
  } | null;
  lastRunAt: string | null;
};

export type BenchmarkReportRow = {
  benchmarkId: BenchmarkRequestInput["benchmarkId"];
  title: string;
  selectedProviders: number;
  testedProviders: number;
  successfulProviders: number;
  latestPassRate: number | null;
  medianRuntimeSeconds: number | null;
  medianCostPer1kTokensUsd: number | null;
  bestProviderLabel: string | null;
  lastRunAt: string | null;
};

export type BenchmarkReport = {
  visibility: "public";
  storesPromptOutputText: false;
  rows: BenchmarkReportRow[];
};

export type BenchmarkSummary = {
  dataState: DataState;
  lastUpdated: string;
  filters: BenchmarkQuery;
  definitions: BenchmarkDefinition[];
  runs: BenchmarkRun[];
  matrix: BenchmarkMatrixRow[];
  report: BenchmarkReport;
  totals: {
    selectedProviders: number;
    benchmarkRuns: number;
    successfulRuns: number;
    failedRuns: number;
    timedOutRuns: number;
    untestedCells: number;
    passRate: number | null;
  };
  warnings: string[];
};

const benchmarkRunSchema: z.ZodType<BenchmarkRun> = z.object({
  benchmarkRunVersion: z.literal(1),
  benchmarkRunId: z.string().trim().min(1),
  benchmarkId: benchmarkIdSchema,
  providerId: z.string().trim().min(1),
  providerLabel: z.string().trim().min(1),
  modelClass: z.string().trim().min(1),
  workloadType: z.string().trim().min(1),
  model: z.string().trim().min(1),
  inputSizeBucket: z.string().trim().min(1),
  outputSizeBucket: z.string().trim().min(1),
  batchSize: z.number().int().positive(),
  adapterVersion: z.literal(ADAPTER_VERSION),
  status: benchmarkStatusSchema,
  sourceState: dataStateSchema,
  visibility: z.literal("public"),
  receiptId: z.string().trim().min(1),
  receiptSignatureStatus: signatureStatusSchema,
  jobId: z.string().trim().min(1),
  sampleSize: z.literal(1),
  queueSeconds: z.number().finite().nonnegative().nullable(),
  runtimeSeconds: z.number().finite().nonnegative(),
  gpuSeconds: z.number().finite().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  tokensPerSecond: z.number().finite().nonnegative(),
  providerCostUsd: z.number().finite().nonnegative(),
  costPer1kTokensUsd: z.number().finite().nonnegative().nullable(),
  createdAt: z.string().trim().min(1)
});

export function parseBenchmarkRequest(body: unknown) {
  return benchmarkRequestSchema.safeParse(body);
}

export function parseBenchmarkQuery(searchParams: URLSearchParams) {
  return benchmarkQuerySchema.safeParse(queryObject(searchParams));
}

export async function runProviderBenchmark(input: BenchmarkRequestInput) {
  const definition = benchmarkDefinitions.find((candidate) => candidate.benchmarkId === input.benchmarkId) ?? benchmarkDefinitions[0];
  const result = await runProviderJob({
    providerId: input.providerId,
    workloadType: definition.workloadType,
    model: definition.model,
    inputRef: definition.inputRef,
    parameters: definition.parameters,
    maxRuntimeSeconds: definition.maxRuntimeSeconds,
    maxCostUsd: definition.maxCostUsd,
    adapterMode: input.adapterMode
  } satisfies ProviderJobRequestInput);
  const run = buildBenchmarkRun(definition, result.receipt);
  await writeBenchmarkRun(run);

  return result.ok ? { ok: true as const, status: 200, run, receipt: result.receipt } : { ok: false as const, status: result.status, run, receipt: result.receipt, error: result.error };
}

export async function summarizeBenchmarks(query: BenchmarkQuery = { selectedOnly: true, limit: 100 }): Promise<BenchmarkSummary> {
  const [registry, runs] = await Promise.all([collectProviderPilotRegistry(), readBenchmarkRuns()]);
  const selectedProviderIds = new Set(registry.allowlist.map((entry) => entry.providerId));
  const providers = buildBenchmarkProviders({ selectedProviderIds, registryProviders: registry.providers, runs, selectedOnly: query.selectedOnly }).filter((provider) => providerMatchesQuery(provider, query));
  const definitions: BenchmarkDefinition[] = benchmarkDefinitions.map((definition) => ({ ...definition, adapterVersion: ADAPTER_VERSION as typeof ADAPTER_VERSION })).filter((definition) => !query.benchmarkId || definition.benchmarkId === query.benchmarkId);
  const matrix = providers
    .flatMap((provider) => definitions.map((definition) => buildMatrixRow(provider, definition, runs)))
    .filter((row) => !query.status || row.latestStatus === query.status);
  const providerIds = new Set(providers.map((provider) => provider.providerId));
  const filteredRuns = runs.filter((run) => providerIds.has(run.providerId) && definitions.some((definition) => definition.benchmarkId === run.benchmarkId) && (!query.status || run.status === query.status));
  const sortedRuns = [...filteredRuns].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const successfulRuns = filteredRuns.filter((run) => run.status === "succeeded").length;
  const lastUpdated = sortedRuns.at(-1)?.createdAt ?? new Date().toISOString();

  return {
    dataState: runs.length ? "live" : "sample",
    lastUpdated,
    filters: query,
    definitions,
    runs: sortedRuns.slice(-query.limit).reverse(),
    matrix,
    report: buildBenchmarkReport(matrix, definitions),
    totals: {
      selectedProviders: providers.filter((provider) => provider.selected).length,
      benchmarkRuns: filteredRuns.length,
      successfulRuns,
      failedRuns: filteredRuns.filter((run) => run.status === "failed" || run.status === "not_allowed").length,
      timedOutRuns: filteredRuns.filter((run) => run.status === "timed_out").length,
      untestedCells: matrix.filter((row) => row.latestStatus === "untested").length,
      passRate: filteredRuns.length ? successfulRuns / filteredRuns.length : null
    },
    warnings: [
      ...(providers.length ? [] : ["No providers match the current benchmark filters."]),
      ...(providers.some((provider) => provider.selected) ? [] : ["No selected providers are allowlisted for benchmark runs yet."]),
      ...(runs.length ? [] : ["No benchmark runs recorded yet. Start with the tiny smoke benchmark for each selected provider."])
    ]
  };
}

function buildBenchmarkRun(definition: (typeof benchmarkDefinitions)[number], receipt: ProviderJobReceipt): BenchmarkRun {
  const tokens = receipt.usage.inputTokens + receipt.usage.outputTokens;
  const runtimeSeconds = Math.max(receipt.usage.gpuSeconds, 1);

  return {
    benchmarkRunVersion: 1,
    benchmarkRunId: `bench_${randomUUID()}`,
    benchmarkId: definition.benchmarkId,
    providerId: receipt.providerId,
    providerLabel: receipt.providerLabel,
    modelClass: definition.modelClass,
    workloadType: definition.workloadType,
    model: definition.model,
    inputSizeBucket: definition.inputSizeBucket,
    outputSizeBucket: definition.outputSizeBucket,
    batchSize: definition.batchSize,
    adapterVersion: ADAPTER_VERSION,
    status: receipt.status,
    sourceState: receipt.sourceState,
    visibility: "public",
    receiptId: receipt.receiptId,
    receiptSignatureStatus: receipt.signatureStatus,
    jobId: receipt.jobId,
    sampleSize: 1,
    queueSeconds: null,
    runtimeSeconds,
    gpuSeconds: receipt.usage.gpuSeconds,
    inputTokens: receipt.usage.inputTokens,
    outputTokens: receipt.usage.outputTokens,
    tokensPerSecond: Number((receipt.usage.outputTokens / runtimeSeconds).toFixed(4)),
    providerCostUsd: receipt.cost.providerCostUsd,
    costPer1kTokensUsd: tokens ? Number(((receipt.cost.providerCostUsd / tokens) * 1000).toFixed(6)) : null,
    createdAt: receipt.completedAt
  };
}

function buildMatrixRow(provider: BenchmarkProvider, definition: BenchmarkDefinition, runs: BenchmarkRun[]): BenchmarkMatrixRow {
  const matchingRuns = runs.filter((run) => run.providerId === provider.providerId && run.benchmarkId === definition.benchmarkId);
  const latest = [...matchingRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const successful = matchingRuns.filter((run) => run.status === "succeeded");
  const failureDetail = buildFailureDetail(latest);

  return {
    providerId: provider.providerId,
    providerLabel: provider.providerLabel,
    selected: provider.selected,
    benchmarkId: definition.benchmarkId,
    title: definition.title,
    modelClass: definition.modelClass,
    workloadType: definition.workloadType,
    inputSizeBucket: definition.inputSizeBucket,
    outputSizeBucket: definition.outputSizeBucket,
    batchSize: definition.batchSize,
    adapterVersion: definition.adapterVersion,
    latestStatus: latest?.status ?? "untested",
    sampleSize: matchingRuns.length,
    successRate: matchingRuns.length ? successful.length / matchingRuns.length : null,
    medianQueueSeconds: median(matchingRuns.flatMap((run) => (run.queueSeconds === null ? [] : [run.queueSeconds]))),
    medianRuntimeSeconds: median(matchingRuns.map((run) => run.runtimeSeconds)),
    tokensPerSecond: latest?.tokensPerSecond ?? null,
    providerCostUsd: latest?.providerCostUsd ?? null,
    costPer1kTokensUsd: latest?.costPer1kTokensUsd ?? null,
    receiptSignatureStatus: latest?.receiptSignatureStatus ?? "missing",
    latestReceiptId: latest?.receiptId ?? null,
    latestReceiptUrl: latest ? `/api/proof/receipts/${latest.receiptId}` : null,
    latestJobId: latest?.jobId ?? null,
    failureDetail,
    lastRunAt: latest?.createdAt ?? null
  };
}

type BenchmarkProvider = {
  providerId: string;
  providerLabel: string;
  selected: boolean;
};

function buildBenchmarkProviders(input: { selectedProviderIds: Set<string>; registryProviders: Array<{ providerId: string; publicLabel: string }>; runs: BenchmarkRun[]; selectedOnly: boolean }): BenchmarkProvider[] {
  const byProvider = new Map<string, BenchmarkProvider>();
  for (const providerId of input.selectedProviderIds) {
    const provider = input.registryProviders.find((candidate) => candidate.providerId === providerId);
    byProvider.set(providerId, {
      providerId,
      providerLabel: provider?.publicLabel ?? providerId,
      selected: true
    });
  }

  if (!input.selectedOnly) {
    for (const run of input.runs) {
      if (byProvider.has(run.providerId)) {
        continue;
      }
      byProvider.set(run.providerId, {
        providerId: run.providerId,
        providerLabel: run.providerLabel,
        selected: false
      });
    }
  }

  return Array.from(byProvider.values()).sort((a, b) => Number(b.selected) - Number(a.selected) || a.providerLabel.localeCompare(b.providerLabel));
}

function providerMatchesQuery(provider: BenchmarkProvider, query: BenchmarkQuery) {
  if (query.providerId && provider.providerId !== query.providerId) {
    return false;
  }
  if (!query.provider) {
    return true;
  }
  const needle = query.provider.toLowerCase();
  return provider.providerId.toLowerCase().includes(needle) || provider.providerLabel.toLowerCase().includes(needle);
}

function buildFailureDetail(latest: BenchmarkRun | undefined): BenchmarkMatrixRow["failureDetail"] {
  if (!latest || latest.status === "succeeded") {
    return null;
  }
  return {
    status: latest.status,
    receiptUrl: `/api/proof/receipts/${latest.receiptId}`,
    message: `${latest.status.replaceAll("_", " ")} on ${latest.benchmarkId}`
  };
}

function buildBenchmarkReport(matrix: BenchmarkMatrixRow[], definitions: BenchmarkDefinition[]): BenchmarkReport {
  return {
    visibility: "public",
    storesPromptOutputText: false,
    rows: definitions.map((definition) => {
      const rows = matrix.filter((row) => row.benchmarkId === definition.benchmarkId);
      const tested = rows.filter((row) => row.latestStatus !== "untested");
      const successful = tested.filter((row) => row.latestStatus === "succeeded");
      const bestProvider = [...successful].sort(compareBenchmarkRows)[0];
      const lastRunAt = tested
        .flatMap((row) => (row.lastRunAt ? [row.lastRunAt] : []))
        .sort()
        .at(-1);

      return {
        benchmarkId: definition.benchmarkId,
        title: definition.title,
        selectedProviders: rows.length,
        testedProviders: tested.length,
        successfulProviders: successful.length,
        latestPassRate: tested.length ? successful.length / tested.length : null,
        medianRuntimeSeconds: median(tested.flatMap((row) => (row.medianRuntimeSeconds === null ? [] : [row.medianRuntimeSeconds]))),
        medianCostPer1kTokensUsd: median(tested.flatMap((row) => (row.costPer1kTokensUsd === null ? [] : [row.costPer1kTokensUsd]))),
        bestProviderLabel: bestProvider?.providerLabel ?? null,
        lastRunAt: lastRunAt ?? null
      };
    })
  };
}

function compareBenchmarkRows(a: BenchmarkMatrixRow, b: BenchmarkMatrixRow) {
  const passRateDelta = (b.successRate ?? 0) - (a.successRate ?? 0);
  if (passRateDelta !== 0) {
    return passRateDelta;
  }
  const speedDelta = (b.tokensPerSecond ?? 0) - (a.tokensPerSecond ?? 0);
  if (speedDelta !== 0) {
    return speedDelta;
  }
  return (a.costPer1kTokensUsd ?? Number.POSITIVE_INFINITY) - (b.costPer1kTokensUsd ?? Number.POSITIVE_INFINITY);
}

async function writeBenchmarkRun(run: BenchmarkRun) {
  await mkdir(BENCHMARK_RUNS_DIR, { recursive: true });
  await writeFile(path.join(BENCHMARK_RUNS_DIR, `${run.createdAt}-${run.benchmarkRunId}.json`.replaceAll(":", "-")), JSON.stringify(run, null, 2));
}

async function readBenchmarkRuns(): Promise<BenchmarkRun[]> {
  try {
    const files = await readdir(BENCHMARK_RUNS_DIR);
    const runs = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const raw = await readFile(path.join(BENCHMARK_RUNS_DIR, file), "utf8");
            const parsed = benchmarkRunSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        })
    );
    return runs.filter(isBenchmarkRun);
  } catch {
    return [];
  }
}

function isBenchmarkRun(run: BenchmarkRun | null): run is BenchmarkRun {
  return run !== null;
}

function median(values: number[]) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) {
    return sorted[middle];
  }
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(4));
}

function queryObject(searchParams: URLSearchParams) {
  const fields = ["selectedOnly", "provider", "providerId", "benchmarkId", "status", "limit"];
  const entries: Array<[string, string]> = [];
  for (const field of fields) {
    const value = searchParams.get(field);
    if (value && value.trim()) {
      entries.push([field, value]);
    }
  }
  return Object.fromEntries(entries);
}
