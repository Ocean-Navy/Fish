import { listProviderJobReceipts } from "@/lib/providerJobs";
import { summarizeBenchmarks } from "@/lib/providerBenchmarks";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";
import { summarizePayouts } from "@/lib/providerPayouts";
import type { BenchmarkMatrixRow, BenchmarkStatus } from "@/lib/providerBenchmarks";
import type { ProviderJobReceipt } from "@/lib/providerJobs";
import type { ProviderAllowlistEntry, ProviderPilotRegistry, ProviderPilotStatus, ProviderProfile } from "@/lib/providerPilot";
import type { PayoutSummary, PublicPayoutEvent } from "@/lib/providerPayouts";
import type { DataState } from "@/lib/types";

export type ProviderScorecardSignal = "ready" | "proving" | "needs_run" | "review" | "attention";
export type ProviderScorecardState = "new" | "allowed" | "preferred" | "probation" | "paused" | "exited";

export type ProviderScoreInputs = {
  reliability: number;
  performance: number;
  costConfidence: number;
  operatorReadiness: number;
};

export type ProviderScorecardRow = {
  providerId: string;
  providerLabel: string;
  region: string;
  gpuTypes: string[];
  pilotStatus: ProviderPilotStatus | "receipt_only";
  displayState: ProviderScorecardState;
  selected: boolean;
  maxDailySpendUsd: number | null;
  selectionStartedAt: string | null;
  selectionExpiresAt: string | null;
  hasOperatorDecision: boolean;
  score: number;
  scoreLabel: string;
  scoreInputs: ProviderScoreInputs;
  signal: ProviderScorecardSignal;
  jobsRouted: number;
  successfulJobs: number;
  failedJobs: number;
  timedOutJobs: number;
  successRate: number | null;
  verifiedReceipts: number;
  receiptWarnings: number;
  benchmarkRuns: number;
  benchmarkPassRate: number | null;
  latestBenchmarkStatus: BenchmarkStatus;
  medianBenchmarkRuntimeSeconds: number | null;
  costPer1kTokensUsd: number | null;
  outstandingUsd: number;
  paidUsd: number;
  payoutEvents: number;
  latestActivityAt: string | null;
  marketBadges: string[];
};

export type ProviderScorecardSummary = {
  dataState: DataState;
  lastUpdated: string;
  totals: {
    providers: number;
    selectedProviders: number;
    readyProviders: number;
    preferredProviders: number;
    jobsRouted: number;
    verifiedReceipts: number;
    benchmarkRuns: number;
    outstandingUsd: number;
    paidUsd: number;
  };
  rows: ProviderScorecardRow[];
  warnings: string[];
};

type ScorecardProvider = Omit<Pick<ProviderProfile, "providerId" | "publicLabel" | "region" | "gpuTypes" | "pilotStatus" | "updatedAt">, "pilotStatus"> & {
  pilotStatus: ProviderPilotStatus | "receipt_only";
};

export async function summarizeProviderScorecard(): Promise<ProviderScorecardSummary> {
  const [registry, receiptList, payouts, benchmarks] = await Promise.all([collectProviderPilotRegistry(), listProviderJobReceipts(), summarizePayouts(), summarizeBenchmarks()]);
  return buildProviderScorecard(registry, receiptList.data, payouts, benchmarks.matrix, toDataState(receiptList.dataState));
}

export function buildProviderScorecard(registry: ProviderPilotRegistry, receipts: ProviderJobReceipt[], payouts: PayoutSummary, benchmarkRows: BenchmarkMatrixRow[] = [], receiptState: DataState = receipts.length ? "live" : "sample"): ProviderScorecardSummary {
  const allowlistByProvider = new Map(registry.allowlist.map((entry) => [entry.providerId, entry]));
  const receiptsByProvider = groupBy(receipts, (receipt) => receipt.providerId);
  const payoutsByProvider = groupBy(payouts.events, (event) => event.providerId);
  const benchmarkRowsByProvider = groupBy(benchmarkRows, (row) => row.providerId);
  const providers = mergeProviders(registry.providers, receipts, benchmarkRows);

  const rows = providers
    .map((provider) => buildProviderRow(provider, allowlistByProvider.get(provider.providerId), receiptsByProvider.get(provider.providerId) ?? [], payoutsByProvider.get(provider.providerId) ?? [], benchmarkRowsByProvider.get(provider.providerId) ?? []))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (b.latestActivityAt ?? "").localeCompare(a.latestActivityAt ?? "");
    });

  const selectedWithoutProof = rows.filter((row) => row.selected && row.jobsRouted === 0).length;
  const receiptWarnings = rows.reduce((total, row) => total + row.receiptWarnings, 0);

  return {
    dataState: strongestState([registry.dataState, receiptState, payouts.dataState]),
    lastUpdated: latestTimestamp([registry.lastUpdated, payouts.lastUpdated, ...receipts.map((receipt) => receipt.completedAt), ...payouts.events.map((event) => event.createdAt)]),
    totals: {
      providers: rows.length,
      selectedProviders: rows.filter((row) => row.selected).length,
      readyProviders: rows.filter((row) => row.signal === "ready").length,
      preferredProviders: rows.filter((row) => row.displayState === "preferred").length,
      jobsRouted: rows.reduce((total, row) => total + row.jobsRouted, 0),
      verifiedReceipts: rows.reduce((total, row) => total + row.verifiedReceipts, 0),
      benchmarkRuns: rows.reduce((total, row) => total + row.benchmarkRuns, 0),
      outstandingUsd: payouts.totals.outstandingUsd,
      paidUsd: payouts.totals.paid
    },
    rows,
    warnings: [
      ...(rows.length ? [] : ["No providers are on the fish market board yet."]),
      ...(selectedWithoutProof ? [`${selectedWithoutProof} selected provider${selectedWithoutProof === 1 ? "" : "s"} still need a first proof run.`] : []),
      ...(receiptWarnings ? [`${receiptWarnings} receipt signature check${receiptWarnings === 1 ? "" : "s"} need review.`] : [])
    ]
  };
}

function buildProviderRow(provider: ScorecardProvider, allowlist: ProviderAllowlistEntry | undefined, receipts: ProviderJobReceipt[], payouts: PublicPayoutEvent[], benchmarkRows: BenchmarkMatrixRow[]): ProviderScorecardRow {
  const selected = Boolean(allowlist);
  const routedReceipts = receipts.filter((receipt) => receipt.status !== "not_allowed");
  const successfulJobs = routedReceipts.filter((receipt) => receipt.status === "succeeded").length;
  const failedJobs = receipts.filter((receipt) => receipt.status === "failed" || receipt.status === "not_allowed").length;
  const timedOutJobs = receipts.filter((receipt) => receipt.status === "timed_out").length;
  const verifiedReceipts = receipts.filter(isVerifiedReceipt).length;
  const receiptWarnings = receipts.filter((receipt) => receipt.signatureStatus === "invalid" || receipt.signatureStatus === "missing").length;
  const successRate = routedReceipts.length ? successfulJobs / routedReceipts.length : null;
  const verificationRate = receipts.length ? verifiedReceipts / receipts.length : null;
  const outstandingUsd = sum(payouts.filter((event) => event.state === "accrued" || event.state === "review" || event.state === "approved").map((event) => event.amountUsd));
  const paidUsd = sum(payouts.filter((event) => event.state === "paid").map((event) => event.amountUsd));
  const testedBenchmarkRows = benchmarkRows.filter((row) => row.latestStatus !== "untested");
  const successfulBenchmarkRows = testedBenchmarkRows.filter((row) => row.latestStatus === "succeeded");
  const latestBenchmarkRow = [...testedBenchmarkRows].sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""))[0];
  const benchmarkRuns = benchmarkRows.reduce((total, row) => total + row.sampleSize, 0);
  const benchmarkPassRate = testedBenchmarkRows.length ? successfulBenchmarkRows.length / testedBenchmarkRows.length : null;
  const medianBenchmarkRuntimeSeconds = median(testedBenchmarkRows.flatMap((row) => (row.medianRuntimeSeconds === null ? [] : [row.medianRuntimeSeconds])));
  const costPer1kTokensUsd = median(testedBenchmarkRows.flatMap((row) => (row.costPer1kTokensUsd === null ? [] : [row.costPer1kTokensUsd])));
  const scoreInputs = scoreProvider({
    selected,
    pilotStatus: provider.pilotStatus,
    jobsRouted: routedReceipts.length,
    successRate,
    verificationRate,
    benchmarkRuns,
    benchmarkPassRate,
    medianBenchmarkRuntimeSeconds,
    costPer1kTokensUsd,
    payoutEvents: payouts.length,
    failedJobs,
    timedOutJobs,
    receiptWarnings
  });
  const score = weightedScore(scoreInputs);
  const signal = signalForProvider({ score, selected, jobsRouted: routedReceipts.length, successfulJobs, failedJobs, timedOutJobs, receiptWarnings });
  const displayState = displayStateForProvider({ pilotStatus: provider.pilotStatus, selected, signal, score });

  return {
    providerId: provider.providerId,
    providerLabel: provider.publicLabel,
    region: provider.region,
    gpuTypes: provider.gpuTypes,
    pilotStatus: provider.pilotStatus,
    displayState,
    selected,
    maxDailySpendUsd: allowlist?.maxDailySpendUsd ?? null,
    selectionStartedAt: allowlist?.startsAt ?? null,
    selectionExpiresAt: allowlist?.expiresAt ?? null,
    hasOperatorDecision: Boolean(allowlist),
    score,
    scoreLabel: scoreLabel(score, signal),
    scoreInputs,
    signal,
    jobsRouted: routedReceipts.length,
    successfulJobs,
    failedJobs,
    timedOutJobs,
    successRate,
    verifiedReceipts,
    receiptWarnings,
    benchmarkRuns,
    benchmarkPassRate,
    latestBenchmarkStatus: latestBenchmarkRow?.latestStatus ?? "untested",
    medianBenchmarkRuntimeSeconds,
    costPer1kTokensUsd,
    outstandingUsd,
    paidUsd,
    payoutEvents: payouts.length,
    latestActivityAt: latestTimestamp([provider.updatedAt, ...receipts.map((receipt) => receipt.completedAt), ...payouts.map((event) => event.createdAt), ...benchmarkRows.map((row) => row.lastRunAt)]),
    marketBadges: badgesForProvider({ selected, jobsRouted: routedReceipts.length, benchmarkRuns, verifiedReceipts, receiptWarnings, outstandingUsd, paidUsd })
  };
}

function mergeProviders(providers: ProviderProfile[], receipts: ProviderJobReceipt[], benchmarkRows: BenchmarkMatrixRow[]): ScorecardProvider[] {
  const byProvider = new Map<string, ScorecardProvider>(
    providers.map((provider) => [
      provider.providerId,
      {
        providerId: provider.providerId,
        publicLabel: provider.publicLabel,
        region: provider.region,
        gpuTypes: provider.gpuTypes,
        pilotStatus: provider.pilotStatus,
        updatedAt: provider.updatedAt
      }
    ])
  );

  for (const receipt of receipts) {
    if (byProvider.has(receipt.providerId)) {
      continue;
    }
    byProvider.set(receipt.providerId, {
      providerId: receipt.providerId,
      publicLabel: receipt.providerLabel,
      region: "Ocean route",
      gpuTypes: [],
      pilotStatus: "receipt_only",
      updatedAt: receipt.completedAt
    });
  }

  for (const benchmarkRow of benchmarkRows) {
    if (byProvider.has(benchmarkRow.providerId)) {
      continue;
    }
    byProvider.set(benchmarkRow.providerId, {
      providerId: benchmarkRow.providerId,
      publicLabel: benchmarkRow.providerLabel,
      region: "Benchmark route",
      gpuTypes: [],
      pilotStatus: "receipt_only",
      updatedAt: benchmarkRow.lastRunAt ?? new Date().toISOString()
    });
  }

  return Array.from(byProvider.values());
}

function scoreProvider(input: {
  selected: boolean;
  pilotStatus: ProviderPilotStatus | "receipt_only";
  jobsRouted: number;
  successRate: number | null;
  verificationRate: number | null;
  benchmarkRuns: number;
  benchmarkPassRate: number | null;
  medianBenchmarkRuntimeSeconds: number | null;
  costPer1kTokensUsd: number | null;
  payoutEvents: number;
  failedJobs: number;
  timedOutJobs: number;
  receiptWarnings: number;
}): ProviderScoreInputs {
  const operatorReadiness = input.selected ? 85 : input.pilotStatus === "verified" ? 55 : input.pilotStatus === "applied" || input.pilotStatus === "contacted" ? 30 : 10;
  const reliabilityBase = input.successRate === null ? (input.selected ? 20 : 0) : input.successRate * 75;
  const reliability = clamp(Math.round(reliabilityBase + (input.verificationRate ?? 0) * 25 - input.failedJobs * 8 - input.timedOutJobs * 6 - input.receiptWarnings * 12), 0, 100);
  const performance = clamp(Math.round((input.benchmarkPassRate === null ? (input.selected ? 15 : 0) : input.benchmarkPassRate * 70) + Math.min(20, input.benchmarkRuns * 5) + runtimeBonus(input.medianBenchmarkRuntimeSeconds)), 0, 100);
  const costConfidence = clamp(Math.round((input.costPer1kTokensUsd === null ? 0 : 45 + Math.max(0, 25 - input.costPer1kTokensUsd * 10)) + (input.payoutEvents ? 20 : 0) + (input.jobsRouted ? 10 : 0)), 0, 100);

  return {
    reliability,
    performance,
    costConfidence,
    operatorReadiness
  };
}

function weightedScore(inputs: ProviderScoreInputs) {
  return clamp(Math.round(inputs.reliability * 0.4 + inputs.performance * 0.25 + inputs.costConfidence * 0.2 + inputs.operatorReadiness * 0.15), 0, 100);
}

function runtimeBonus(value: number | null) {
  if (value === null) {
    return 0;
  }
  if (value <= 3) {
    return 10;
  }
  if (value <= 10) {
    return 6;
  }
  return 2;
}

function displayStateForProvider(input: { pilotStatus: ProviderPilotStatus | "receipt_only"; selected: boolean; signal: ProviderScorecardSignal; score: number }): ProviderScorecardState {
  if (input.pilotStatus === "paused" || input.pilotStatus === "rejected" || input.signal === "attention") {
    return "paused";
  }
  if (input.pilotStatus === "exited") {
    return "exited";
  }
  if (input.score >= 80 && input.selected) {
    return "preferred";
  }
  if (input.selected) {
    return "allowed";
  }
  if (input.pilotStatus === "verified") {
    return "allowed";
  }
  if (input.pilotStatus === "probation") {
    return "probation";
  }
  return "new";
}

function signalForProvider(input: { score: number; selected: boolean; jobsRouted: number; successfulJobs: number; failedJobs: number; timedOutJobs: number; receiptWarnings: number }): ProviderScorecardSignal {
  if (input.receiptWarnings || input.failedJobs + input.timedOutJobs > input.successfulJobs) {
    return "attention";
  }
  if (input.score >= 75) {
    return "ready";
  }
  if (input.jobsRouted > 0) {
    return "proving";
  }
  if (input.selected) {
    return "needs_run";
  }
  return "review";
}

function scoreLabel(score: number, signal: ProviderScorecardSignal) {
  if (signal === "attention") {
    return "Check nets";
  }
  if (score >= 75) {
    return "Ready boat";
  }
  if (score >= 50) {
    return "Good catch";
  }
  if (score >= 25) {
    return "First run";
  }
  return "At the dock";
}

function badgesForProvider(input: { selected: boolean; jobsRouted: number; benchmarkRuns: number; verifiedReceipts: number; receiptWarnings: number; outstandingUsd: number; paidUsd: number }) {
  return [
    input.selected ? "Selected" : "Review",
    input.jobsRouted ? "Jobs run" : "Needs run",
    input.benchmarkRuns ? "Benchmarked" : "No benchmark",
    input.verifiedReceipts && !input.receiptWarnings ? "Stamped" : input.receiptWarnings ? "Check stamp" : "No stamp",
    input.paidUsd ? "Paid" : input.outstandingUsd ? "Chest filling" : "No chest"
  ];
}

function isVerifiedReceipt(receipt: ProviderJobReceipt) {
  return receipt.signatureStatus === "valid" || receipt.signatureStatus === "not_required";
}

function strongestState(states: DataState[]): DataState {
  if (states.includes("live")) {
    return "live";
  }
  if (states.includes("snapshot")) {
    return "snapshot";
  }
  if (states.includes("sample")) {
    return "sample";
  }
  return "unavailable";
}

function toDataState(value: string): DataState {
  return value === "live" || value === "snapshot" || value === "sample" || value === "unavailable" ? value : "sample";
}

function latestTimestamp(values: Array<string | null | undefined>) {
  const valid = values.flatMap((value) => {
    if (!value) {
      return [];
    }
    return Number.isNaN(new Date(value).getTime()) ? [] : [value];
  });
  return valid.sort((a, b) => a.localeCompare(b)).at(-1) ?? new Date().toISOString();
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

function groupBy<T>(items: T[], keyForItem: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(6));
}
