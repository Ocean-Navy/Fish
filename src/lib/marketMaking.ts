import { summarizeBenchmarks } from "@/lib/providerBenchmarks";
import { summarizeFishUsage } from "@/lib/fishLedger";
import { collectOceanData } from "@/lib/oceanSupply";
import { summarizeProviderScorecard } from "@/lib/providerScorecard";
import type { BenchmarkMatrixRow, BenchmarkSummary } from "@/lib/providerBenchmarks";
import type { FishUsageSummary } from "@/lib/fishLedger";
import type { ProviderScorecardRow, ProviderScorecardSummary } from "@/lib/providerScorecard";
import type { DataState, OceanSummary } from "@/lib/types";

const TARGET_MARGIN_RATE = 0.35;
const RESERVE_RATE = 0.1;
const MIN_PRICE_USD_PER_1K = 0.002;

export type MarketRouteState = "route_now" | "pilot_only" | "benchmark_first" | "watch" | "pause";
export type PricingConfidence = "none" | "low" | "medium" | "high";

export type MarketCostModel = {
  benchmarkId: string;
  title: string;
  modelClass: string;
  workloadType: string;
  providerCount: number;
  sampleSize: number;
  providerCostUsdPer1kTokens: number | null;
  suggestedUserPriceUsdPer1kTokens: number | null;
  grossMarginUsdPer1kTokens: number | null;
  grossMarginRate: number | null;
  reserveContributionUsdPer1kTokens: number | null;
  pricingConfidence: PricingConfidence;
  bestProviderLabel: string | null;
};

export type MarketRouteCandidate = {
  providerId: string;
  providerLabel: string;
  displayState: ProviderScorecardRow["displayState"];
  signal: ProviderScorecardRow["signal"];
  score: number;
  routeState: MarketRouteState;
  routeReason: string;
  benchmarkId: string | null;
  benchmarkStatus: string;
  benchmarkPassRate: number | null;
  medianRuntimeSeconds: number | null;
  providerCostUsdPer1kTokens: number | null;
  suggestedUserPriceUsdPer1kTokens: number | null;
  grossMarginUsdPer1kTokens: number | null;
  maxDailySpendUsd: number | null;
  badges: string[];
};

export type MarketMakingSummary = {
  dataState: DataState;
  lastUpdated: string;
  visibility: "public";
  storesPromptOutputText: false;
  routeRules: string[];
  demand: {
    fishRequests: number;
    creditsSpent: number;
    grossMarginUsd: number;
    demandState: DataState;
  };
  supply: {
    oceanProviders: number;
    totalGpus: number;
    availableGpus: number;
    supplyState: DataState;
  };
  totals: {
    selectedProviders: number;
    routeNow: number;
    pilotOnly: number;
    benchmarkFirst: number;
    watch: number;
    paused: number;
    costModels: number;
    pricingConfidence: PricingConfidence;
  };
  costModels: MarketCostModel[];
  routes: MarketRouteCandidate[];
  publicNarrative: string;
  warnings: string[];
};

export async function summarizeMarketMaking(parts?: {
  oceanSummary?: OceanSummary;
  fishUsage?: FishUsageSummary;
  scorecard?: ProviderScorecardSummary;
  benchmarks?: BenchmarkSummary;
}): Promise<MarketMakingSummary> {
  const [oceanData, fishUsage, scorecard, benchmarks] = await Promise.all([
    parts?.oceanSummary ? Promise.resolve({ summary: parts.oceanSummary }) : collectOceanData(),
    parts?.fishUsage ? Promise.resolve(parts.fishUsage) : summarizeFishUsage(),
    parts?.scorecard ? Promise.resolve(parts.scorecard) : summarizeProviderScorecard(),
    parts?.benchmarks ? Promise.resolve(parts.benchmarks) : summarizeBenchmarks()
  ]);

  const costModels = buildCostModels(benchmarks);
  const routes = buildRoutes(scorecard.rows, benchmarks.matrix, costModels);
  const routeCounts = countRoutes(routes);
  const dataState = strongestState([oceanData.summary.dataState, fishUsage.dataState, scorecard.dataState, benchmarks.dataState]);
  const pricingConfidence = strongestPricingConfidence(costModels.map((model) => model.pricingConfidence));

  return {
    dataState,
    lastUpdated: latestTimestamp([oceanData.summary.lastUpdated, fishUsage.lastReceiptAt, scorecard.lastUpdated, benchmarks.lastUpdated]),
    visibility: "public",
    storesPromptOutputText: false,
    routeRules: [
      "Only selected providers can receive routed Fish jobs.",
      "A provider needs valid receipts and benchmark evidence before route_now.",
      "Attention, paused, or failed routes stay out of user traffic.",
      "Suggested prices use provider benchmark costs plus margin and reserve buffers."
    ],
    demand: {
      fishRequests: fishUsage.requests,
      creditsSpent: fishUsage.creditsSpent,
      grossMarginUsd: fishUsage.grossMarginUsd,
      demandState: fishUsage.dataState
    },
    supply: {
      oceanProviders: oceanData.summary.kpis.providerCount,
      totalGpus: oceanData.summary.kpis.totalGpus,
      availableGpus: oceanData.summary.kpis.availableGpus,
      supplyState: oceanData.summary.dataState
    },
    totals: {
      selectedProviders: scorecard.totals.selectedProviders,
      ...routeCounts,
      costModels: costModels.length,
      pricingConfidence
    },
    costModels,
    routes,
    publicNarrative: narrativeForReport(routes, costModels, fishUsage),
    warnings: [
      ...(routes.some((route) => route.routeState === "route_now") ? [] : ["No provider is ready for automatic user routing yet. Keep traffic in pilot mode."]),
      ...(costModels.some((model) => model.pricingConfidence === "high" || model.pricingConfidence === "medium") ? [] : ["Pricing confidence is still low because benchmark cost samples are sparse."]),
      ...benchmarks.warnings
    ]
  };
}

function buildCostModels(benchmarks: BenchmarkSummary): MarketCostModel[] {
  return benchmarks.report.rows.map((reportRow) => {
    const rows = benchmarks.matrix.filter((row) => row.benchmarkId === reportRow.benchmarkId && row.latestStatus === "succeeded");
    const costs = rows.flatMap((row) => (row.costPer1kTokensUsd === null ? [] : [row.costPer1kTokensUsd]));
    const sampleSize = rows.reduce((total, row) => total + row.sampleSize, 0);
    const providerCostUsdPer1kTokens = median(costs);
    const suggestedUserPriceUsdPer1kTokens = suggestedPrice(providerCostUsdPer1kTokens);
    const grossMarginUsdPer1kTokens =
      providerCostUsdPer1kTokens === null || suggestedUserPriceUsdPer1kTokens === null ? null : roundMoney(suggestedUserPriceUsdPer1kTokens - providerCostUsdPer1kTokens);
    const grossMarginRate = grossMarginUsdPer1kTokens === null || suggestedUserPriceUsdPer1kTokens === null || suggestedUserPriceUsdPer1kTokens === 0 ? null : Number((grossMarginUsdPer1kTokens / suggestedUserPriceUsdPer1kTokens).toFixed(4));

    return {
      benchmarkId: reportRow.benchmarkId,
      title: reportRow.title,
      modelClass: rows[0]?.modelClass ?? "unknown",
      workloadType: rows[0]?.workloadType ?? "chat_batch",
      providerCount: rows.length,
      sampleSize,
      providerCostUsdPer1kTokens,
      suggestedUserPriceUsdPer1kTokens,
      grossMarginUsdPer1kTokens,
      grossMarginRate,
      reserveContributionUsdPer1kTokens: suggestedUserPriceUsdPer1kTokens === null ? null : roundMoney(suggestedUserPriceUsdPer1kTokens * RESERVE_RATE),
      pricingConfidence: pricingConfidence(rows.length, sampleSize, providerCostUsdPer1kTokens),
      bestProviderLabel: reportRow.bestProviderLabel
    };
  });
}

function buildRoutes(scoreRows: ProviderScorecardRow[], benchmarkRows: BenchmarkMatrixRow[], costModels: MarketCostModel[]): MarketRouteCandidate[] {
  const benchmarkByProvider = groupBy(benchmarkRows, (row) => row.providerId);
  const costModelByBenchmark = new Map(costModels.map((model) => [model.benchmarkId, model]));

  return scoreRows
    .map((row) => {
      const latestBenchmark = latestTestedBenchmark(benchmarkByProvider.get(row.providerId) ?? []);
      const costModel = latestBenchmark ? costModelByBenchmark.get(latestBenchmark.benchmarkId) : undefined;
      const routeState = routeStateFor(row, latestBenchmark, costModel);
      return {
        providerId: row.providerId,
        providerLabel: row.providerLabel,
        displayState: row.displayState,
        signal: row.signal,
        score: row.score,
        routeState,
        routeReason: routeReason(routeState),
        benchmarkId: latestBenchmark?.benchmarkId ?? null,
        benchmarkStatus: latestBenchmark?.latestStatus ?? "untested",
        benchmarkPassRate: row.benchmarkPassRate,
        medianRuntimeSeconds: row.medianBenchmarkRuntimeSeconds,
        providerCostUsdPer1kTokens: latestBenchmark?.costPer1kTokensUsd ?? null,
        suggestedUserPriceUsdPer1kTokens: costModel?.suggestedUserPriceUsdPer1kTokens ?? null,
        grossMarginUsdPer1kTokens: costModel?.grossMarginUsdPer1kTokens ?? null,
        maxDailySpendUsd: row.maxDailySpendUsd,
        badges: badgesForRoute(row, routeState)
      };
    })
    .sort((a, b) => {
      const stateDelta = routeRank(a.routeState) - routeRank(b.routeState);
      if (stateDelta !== 0) {
        return stateDelta;
      }
      return b.score - a.score;
    });
}

function latestTestedBenchmark(rows: BenchmarkMatrixRow[]) {
  return [...rows]
    .filter((row) => row.latestStatus !== "untested")
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""))[0];
}

function routeStateFor(row: ProviderScorecardRow, benchmark: BenchmarkMatrixRow | undefined, costModel: MarketCostModel | undefined): MarketRouteState {
  if (row.signal === "attention" || row.displayState === "paused" || row.displayState === "exited") {
    return "pause";
  }
  if (!row.selected) {
    return "watch";
  }
  if (!benchmark || benchmark.latestStatus === "untested") {
    return "benchmark_first";
  }
  if (benchmark.latestStatus !== "succeeded" || (row.benchmarkPassRate ?? 0) < 0.8) {
    return "pilot_only";
  }
  if (row.score >= 75 && costModel && costModel.pricingConfidence !== "none") {
    return "route_now";
  }
  return "pilot_only";
}

function routeReason(state: MarketRouteState) {
  const reasons: Record<MarketRouteState, string> = {
    route_now: "Ready for controlled user traffic",
    pilot_only: "Keep in operator-routed pilot jobs",
    benchmark_first: "Needs a fresh benchmark stamp",
    watch: "Not selected for routing yet",
    pause: "Needs operator review before more traffic"
  };
  return reasons[state];
}

function badgesForRoute(row: ProviderScorecardRow, routeState: MarketRouteState) {
  return [
    routeState === "route_now" ? "Route now" : routeState === "pilot_only" ? "Pilot lane" : routeState === "benchmark_first" ? "Bench first" : routeState === "pause" ? "Paused" : "Watch",
    row.benchmarkRuns ? "Benchmarked" : "No benchmark",
    row.verifiedReceipts ? "Stamped" : "No stamp",
    row.outstandingUsd || row.paidUsd ? "Settlement seen" : "No settlement"
  ];
}

function countRoutes(routes: MarketRouteCandidate[]) {
  return {
    routeNow: routes.filter((route) => route.routeState === "route_now").length,
    pilotOnly: routes.filter((route) => route.routeState === "pilot_only").length,
    benchmarkFirst: routes.filter((route) => route.routeState === "benchmark_first").length,
    watch: routes.filter((route) => route.routeState === "watch").length,
    paused: routes.filter((route) => route.routeState === "pause").length
  };
}

function narrativeForReport(routes: MarketRouteCandidate[], costModels: MarketCostModel[], fishUsage: FishUsageSummary) {
  const routeNow = routes.filter((route) => route.routeState === "route_now").length;
  const bestCost = costModels.find((model) => model.suggestedUserPriceUsdPer1kTokens !== null);
  if (!routeNow) {
    return "The market is still in pilot mode: prove more provider routes before sending automatic user traffic.";
  }
  if (!fishUsage.requests) {
    return "Provider routes are emerging, but Fish demand is still sample-level. Keep prices conservative until real usage arrives.";
  }
  return `The first ${routeNow} provider route${routeNow === 1 ? "" : "s"} can support controlled traffic${bestCost ? ` around ${bestCost.title}` : ""}.`;
}

function suggestedPrice(providerCostUsdPer1kTokens: number | null) {
  if (providerCostUsdPer1kTokens === null) {
    return null;
  }
  return roundMoney(Math.max(MIN_PRICE_USD_PER_1K, providerCostUsdPer1kTokens / (1 - TARGET_MARGIN_RATE)));
}

function pricingConfidence(providerCount: number, sampleSize: number, providerCostUsdPer1kTokens: number | null): PricingConfidence {
  if (providerCostUsdPer1kTokens === null) {
    return "none";
  }
  if (providerCount >= 3 && sampleSize >= 6) {
    return "high";
  }
  if (providerCount >= 2 || sampleSize >= 3) {
    return "medium";
  }
  return "low";
}

function strongestPricingConfidence(values: PricingConfidence[]): PricingConfidence {
  if (values.includes("high")) {
    return "high";
  }
  if (values.includes("medium")) {
    return "medium";
  }
  if (values.includes("low")) {
    return "low";
  }
  return "none";
}

function routeRank(state: MarketRouteState) {
  const ranks: Record<MarketRouteState, number> = {
    route_now: 0,
    pilot_only: 1,
    benchmark_first: 2,
    watch: 3,
    pause: 4
  };
  return ranks[state];
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
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(6));
}

function roundMoney(value: number) {
  return Number(value.toFixed(6));
}

function groupBy<T>(items: T[], keyForItem: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}
