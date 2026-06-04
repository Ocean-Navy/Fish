import { sumProviderCostForRouteSince } from "@/lib/fishLedger";
import type { FishChatRouteId, FishRouterConfig } from "@/lib/fishRouter";

export type RouteBudgetCheck =
  | {
      ok: true;
      route: FishChatRouteId;
      dailyBudgetUsd: number;
      spentUsd: number;
      estimatedCostUsd: number;
      remainingUsd: number;
    }
  | {
      ok: false;
      route: FishChatRouteId;
      dailyBudgetUsd: number;
      spentUsd: number;
      estimatedCostUsd: number;
      remainingUsd: number;
    };

export async function checkRouteDailyBudget(input: {
  route: FishChatRouteId;
  promptTokens: number;
  maxOutputTokens: number;
  routerConfig: FishRouterConfig;
}): Promise<RouteBudgetCheck> {
  const dailyBudgetUsd = input.routerConfig.budgets.dailyUsdByRoute[input.route];
  const estimatedCostUsd = estimateProviderCostUsd(input.route, input.promptTokens + input.maxOutputTokens, input.routerConfig);
  const spentUsd = await sumProviderCostForRouteSince(input.route === "ocean-demo-vllm" ? "ocean-demo-vllm" : input.route, startOfUtcDayIso());
  const remainingUsd = Number(Math.max(0, dailyBudgetUsd - spentUsd - estimatedCostUsd).toFixed(6));
  return {
    ok: spentUsd + estimatedCostUsd <= dailyBudgetUsd,
    route: input.route,
    dailyBudgetUsd,
    spentUsd,
    estimatedCostUsd,
    remainingUsd
  };
}

function estimateProviderCostUsd(route: FishChatRouteId, maxTokens: number, routerConfig: FishRouterConfig) {
  const costUsdPer1kTokens =
    route === "ocean-demo-vllm"
      ? routerConfig.warm.costUsdPer1kTokens
      : route === "ocean-provider"
        ? routerConfig.selectedProvider.costUsdPer1kTokens
        : route === "external-fallback"
          ? routerConfig.external.costUsdPer1kTokens
          : 0;
  return Number(((maxTokens / 1000) * Math.max(0, costUsdPer1kTokens)).toFixed(6));
}

function startOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
