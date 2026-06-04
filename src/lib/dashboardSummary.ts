import { summarizeFishUsage } from "@/lib/fishLedger";
import { collectOceanData } from "@/lib/oceanSupply";
import { summarizeCapacitySettlements } from "@/lib/capacitySettlements";
import { summarizeFishContracts } from "@/lib/fishContracts";
import { getFishRouterConfig } from "@/lib/fishRouter";
import { getFishRoutePolicy } from "@/lib/routePolicy";
import { getWarmInferenceStatus } from "@/lib/warmInferenceStatus";
import type { DataState } from "@/lib/types";

export async function getFishDashboardSummary() {
  const [oceanData, fishUsage, routePolicy, warmStatus, contractStatus, capacitySettlements] = await Promise.all([
    collectOceanData(),
    summarizeFishUsage(),
    Promise.resolve(getFishRoutePolicy()),
    getWarmInferenceStatus({ timeoutMs: 1200 }),
    summarizeFishContracts(),
    summarizeCapacitySettlements()
  ]);
  const oceanSummary = oceanData.summary;
  const routerConfig = getFishRouterConfig();
  const activeRouteConfig = routerConfig.routes[routerConfig.activeRouteId];

  return {
    dataState: combinedDataState([oceanSummary.dataState, fishUsage.dataState, routePolicy.dataState, warmStatus.dataState, contractStatus.dataState, capacitySettlements.dataState]),
    generatedAt: new Date().toISOString(),
    product: {
      name: "Fish",
      tagline: "Turn Ocean Network compute into easy AI.",
      publicState: routePolicy.activeRoute.isRealAi ? "real-ai-pilot" : "demo-pilot"
    },
    activeRoute: {
      id: routePolicy.activeRoute.id,
      label: routePolicy.activeRoute.label,
      status: routePolicy.activeRoute.status,
      isRealAi: routePolicy.activeRoute.isRealAi,
      providerId: activeRouteConfig.providerId
    },
    warmRoute: {
      routeId: warmStatus.routeId,
      label: warmStatus.publicLabel,
      providerId: warmStatus.providerId,
      active: warmStatus.routeActive,
      configured: warmStatus.configured,
      model: warmStatus.configuredModel,
      probeState: warmStatus.probe.state,
      modelVisible: warmStatus.probe.modelVisible,
      latencyMs: warmStatus.probe.latencyMs
    },
    fishUsage: {
      requests: fishUsage.requests,
      accounts: fishUsage.accounts,
      tokensServed: fishUsage.tokensServed,
      oceanNativeJobs: fishUsage.oceanNativeJobs,
      externalFallbackJobs: fishUsage.externalFallbackJobs,
      mockJobs: fishUsage.mockJobs,
      oceanNativeShare: fishUsage.oceanNativeShare,
      runnerProofJobs: fishUsage.runnerProofJobs,
      runnerVerifiedJobs: fishUsage.runnerVerifiedJobs,
      failedRequests: fishUsage.failedRequests,
      averageLatencyMs: fishUsage.averageLatencyMs,
      creditsSpent: fishUsage.creditsSpent,
      creditsRemaining: fishUsage.creditsRemaining,
      lastReceiptAt: fishUsage.lastReceiptAt
    },
    oceanSupply: {
      dataState: oceanSummary.dataState,
      lastUpdated: oceanSummary.lastUpdated,
      sourceCount: oceanSummary.sourceCount,
      totalGpus: oceanSummary.kpis.totalGpus,
      availableGpus: oceanSummary.kpis.availableGpus,
      providerCount: oceanSummary.kpis.providerCount,
      eligibleNodeCount: oceanSummary.kpis.eligibleNodeCount,
      fishReadyProviderCount: oceanSummary.kpis.fishReadyProviderCount,
      topGpuSupply: oceanSummary.gpuSupply.slice(0, 5).map((row) => ({
        gpu: row.gpu,
        total: row.total,
        available: row.available,
        providers: row.providers,
        lowestUsdHr: row.lowestUsdHr
      })),
      topProviders: oceanSummary.providers.slice(0, 5).map((provider) => ({
        providerId: provider.providerId,
        label: provider.label,
        region: provider.region,
        availableGpus: provider.availableGpus,
        gpuTypes: provider.gpuTypes,
        fishReadyStatus: provider.fishReadyStatus,
        nodeStatus: provider.nodeStatus
      }))
    },
    economics: {
      userChargeUsd: fishUsage.userChargeUsd,
      providerCostUsd: fishUsage.providerCostUsd,
      grossMarginUsd: fishUsage.grossMarginUsd,
      averageProviderCostUsd: fishUsage.averageProviderCostUsd,
      providerPayoutUsd: fishUsage.providerPayoutUsd,
      capacitySettlementGrossUsdc: capacitySettlements.totals.grossUsdcAmount,
      capacitySettlementNetUsdc: capacitySettlements.totals.netUsdcAmount,
      capacitySettlementOperatorFeeUsdc: capacitySettlements.totals.operatorFeeUsdc
    },
    contracts: {
      dataState: contractStatus.dataState,
      mode: contractStatus.mode,
      chainId: contractStatus.chain.chainId,
      chainName: contractStatus.chain.chainName,
      rpcConfigured: contractStatus.rpc.configured,
      requiredConfigured: contractStatus.deployment.requiredConfigured,
      readVerified: contractStatus.onchain.readVerified,
      walletWritesAllowed: contractStatus.walletActionGate.writesAllowed,
      settlementSubmitAllowed: contractStatus.settlementSubmitGate.submitAllowed,
      oceanStaking: contractStatus.onchain.oceanStaking,
      fish: contractStatus.onchain.fish,
      capacityPool: contractStatus.onchain.capacityPool,
      capacitySettlements: {
        dataState: capacitySettlements.dataState,
        settlements: capacitySettlements.totals.settlements,
        onchainSubmittedSettlements: capacitySettlements.totals.onchainSubmittedSettlements,
        grossUsdcAmount: capacitySettlements.totals.grossUsdcAmount,
        netUsdcAmount: capacitySettlements.totals.netUsdcAmount
      }
    },
    proof: {
      runnerProofJobs: fishUsage.runnerProofJobs,
      runnerSignedJobs: fishUsage.runnerSignedJobs,
      runnerVerifiedJobs: fishUsage.runnerVerifiedJobs,
      storesPromptOutputText: false
    },
    rules: routePolicy.rules,
    warnings: uniqueStrings([...oceanSummary.warnings, ...warmStatus.warnings, ...contractStatus.warnings, ...capacitySettlements.warnings]).slice(0, 10)
  };
}

function combinedDataState(states: DataState[]): DataState {
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim())));
}
