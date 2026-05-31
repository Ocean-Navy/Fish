import { listProviderJobReceipts } from "@/lib/providerJobs";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";
import { summarizePayouts } from "@/lib/providerPayouts";
import type { ProviderJobReceipt } from "@/lib/providerJobs";
import type { ProviderAllowlistEntry, ProviderPilotRegistry, ProviderPilotStatus, ProviderProfile } from "@/lib/providerPilot";
import type { PayoutSummary, PublicPayoutEvent } from "@/lib/providerPayouts";
import type { DataState } from "@/lib/types";

export type ProviderScorecardSignal = "ready" | "proving" | "needs_run" | "review" | "attention";

export type ProviderScorecardRow = {
  providerId: string;
  providerLabel: string;
  region: string;
  gpuTypes: string[];
  pilotStatus: ProviderPilotStatus | "receipt_only";
  selected: boolean;
  maxDailySpendUsd: number | null;
  score: number;
  scoreLabel: string;
  signal: ProviderScorecardSignal;
  jobsRouted: number;
  successfulJobs: number;
  failedJobs: number;
  timedOutJobs: number;
  successRate: number | null;
  verifiedReceipts: number;
  receiptWarnings: number;
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
    jobsRouted: number;
    verifiedReceipts: number;
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
  const [registry, receiptList, payouts] = await Promise.all([collectProviderPilotRegistry(), listProviderJobReceipts(), summarizePayouts()]);
  return buildProviderScorecard(registry, receiptList.data, payouts, toDataState(receiptList.dataState));
}

export function buildProviderScorecard(registry: ProviderPilotRegistry, receipts: ProviderJobReceipt[], payouts: PayoutSummary, receiptState: DataState = receipts.length ? "live" : "sample"): ProviderScorecardSummary {
  const allowlistByProvider = new Map(registry.allowlist.map((entry) => [entry.providerId, entry]));
  const receiptsByProvider = groupBy(receipts, (receipt) => receipt.providerId);
  const payoutsByProvider = groupBy(payouts.events, (event) => event.providerId);
  const providers = mergeProviders(registry.providers, receipts);

  const rows = providers
    .map((provider) => buildProviderRow(provider, allowlistByProvider.get(provider.providerId), receiptsByProvider.get(provider.providerId) ?? [], payoutsByProvider.get(provider.providerId) ?? []))
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
      jobsRouted: rows.reduce((total, row) => total + row.jobsRouted, 0),
      verifiedReceipts: rows.reduce((total, row) => total + row.verifiedReceipts, 0),
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

function buildProviderRow(provider: ScorecardProvider, allowlist: ProviderAllowlistEntry | undefined, receipts: ProviderJobReceipt[], payouts: PublicPayoutEvent[]): ProviderScorecardRow {
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
  const score = scoreProvider({
    selected,
    pilotStatus: provider.pilotStatus,
    jobsRouted: routedReceipts.length,
    successRate,
    verificationRate,
    payoutEvents: payouts.length,
    failedJobs,
    timedOutJobs,
    receiptWarnings
  });
  const signal = signalForProvider({ score, selected, jobsRouted: routedReceipts.length, successfulJobs, failedJobs, timedOutJobs, receiptWarnings });

  return {
    providerId: provider.providerId,
    providerLabel: provider.publicLabel,
    region: provider.region,
    gpuTypes: provider.gpuTypes,
    pilotStatus: provider.pilotStatus,
    selected,
    maxDailySpendUsd: allowlist?.maxDailySpendUsd ?? null,
    score,
    scoreLabel: scoreLabel(score, signal),
    signal,
    jobsRouted: routedReceipts.length,
    successfulJobs,
    failedJobs,
    timedOutJobs,
    successRate,
    verifiedReceipts,
    receiptWarnings,
    outstandingUsd,
    paidUsd,
    payoutEvents: payouts.length,
    latestActivityAt: latestTimestamp([provider.updatedAt, ...receipts.map((receipt) => receipt.completedAt), ...payouts.map((event) => event.createdAt)]),
    marketBadges: badgesForProvider({ selected, jobsRouted: routedReceipts.length, verifiedReceipts, receiptWarnings, outstandingUsd, paidUsd })
  };
}

function mergeProviders(providers: ProviderProfile[], receipts: ProviderJobReceipt[]): ScorecardProvider[] {
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

  return Array.from(byProvider.values());
}

function scoreProvider(input: {
  selected: boolean;
  pilotStatus: ProviderPilotStatus | "receipt_only";
  jobsRouted: number;
  successRate: number | null;
  verificationRate: number | null;
  payoutEvents: number;
  failedJobs: number;
  timedOutJobs: number;
  receiptWarnings: number;
}) {
  const reviewBase = input.pilotStatus === "applied" || input.pilotStatus === "contacted" || input.pilotStatus === "verified" ? 8 : 0;
  const selectedBase = input.selected ? 25 : reviewBase;
  const activity = input.jobsRouted ? 15 + Math.min(10, input.jobsRouted * 2) : input.selected ? 8 : 0;
  const success = input.successRate === null ? 0 : input.successRate * 25;
  const verified = input.verificationRate === null ? 0 : input.verificationRate * 15;
  const payout = input.payoutEvents ? 10 : 0;
  const penalty = Math.min(25, input.failedJobs * 5 + input.timedOutJobs * 4 + input.receiptWarnings * 8);

  return clamp(Math.round(selectedBase + activity + success + verified + payout - penalty), 0, 100);
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

function badgesForProvider(input: { selected: boolean; jobsRouted: number; verifiedReceipts: number; receiptWarnings: number; outstandingUsd: number; paidUsd: number }) {
  return [
    input.selected ? "Selected" : "Review",
    input.jobsRouted ? "Jobs run" : "Needs run",
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
