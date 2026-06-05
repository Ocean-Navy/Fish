import { listFishFeaturePolicies, type FishFeatureId } from "@/lib/fishFeaturePolicy";
import { getFishConcurrencySnapshot } from "@/lib/fishConcurrency";
import { getFishRouterConfig, type FishChatRouteId } from "@/lib/fishRouter";
import { readOceanBatchDailyBudgetUsd } from "@/lib/oceanBatch";
import type { DataState } from "@/lib/types";

export type RouteModeId = FishChatRouteId | "ocean-batch" | "ocean-private" | "hardened-runner" | "tee-runner";
export type RouteModeState = "active" | "ready" | "needs-config" | "paused" | "disabled" | "pilot" | "future";

export type FishRoutePolicy = {
  dataState: DataState;
  generatedAt: string;
  activeRoute: {
    id: FishChatRouteId;
    label: string;
    isRealAi: boolean;
    privacy: string;
    evidence: string;
    status: RouteModeState;
  };
  backend: {
    chatRoute: FishChatRouteId;
    paused: boolean;
    killSwitch: boolean;
    warmConfigured: boolean;
    warmBaseUrlConfigured: boolean;
    warmApiKeyConfigured: boolean;
    warmModel: string | null;
    warmProviderId: string;
    selectedProviderConfigured: boolean;
    selectedProviderBaseUrlConfigured: boolean;
    selectedProviderApiKeyConfigured: boolean;
    selectedProviderModel: string | null;
    selectedProviderId: string;
    externalConfigured: boolean;
    externalBaseUrlConfigured: boolean;
    externalApiKeyConfigured: boolean;
    externalModel: string | null;
    externalProviderId: string;
    oceanBatchConfigured: boolean;
    oceanBatchProviderId: string;
    concurrencyActiveRequests: number;
    concurrencyActiveByRoute: Partial<Record<FishChatRouteId, number>>;
  };
  guardrails: {
    maxInputTokens: number;
    maxOutputTokens: number;
    dailyKeyedQuota: number;
    dailyAnonymousQuota: number;
    externalFallbackFreeAllowed: boolean;
    dailyUsdBudgets: Record<FishChatRouteId, number>;
    oceanBatchDailyBudgetUsd: number;
    maxConcurrentRequests: number;
    quotaStorage: "local-json";
    concurrencyStorage: "in-memory";
    rateLimitStorage: "in-memory";
  };
  modes: Array<{
    id: RouteModeId;
    title: string;
    state: RouteModeState;
    short: string;
    privacy: string;
    proof: string;
  }>;
  features: Array<{
    id: FishFeatureId;
    label: string;
    state: "live-beta" | "beta" | "coming-soon";
    primary: string;
    fallback: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    cap: string;
  }>;
  rules: Array<{
    title: string;
    body: string;
  }>;
  nextMilestone: string;
};

export function getFishRoutePolicy(): FishRoutePolicy {
  const router = getFishRouterConfig();
  const configuredRoute = router.routes[router.activeRouteId];
  const activeRoute = activeRoutePolicy(configuredRoute.id, configuredRoute.status);
  const oceanBatchConfigured = Boolean(process.env.FISH_OCEAN_BATCH_ENDPOINT?.trim());
  const oceanBatchProviderId = process.env.FISH_OCEAN_BATCH_PROVIDER_ID?.trim() || "ocean-batch-provider";
  const oceanBatchDailyBudgetUsd = readOceanBatchDailyBudgetUsd();
  const concurrency = getFishConcurrencySnapshot();

  return {
    dataState: "live",
    generatedAt: new Date().toISOString(),
    activeRoute,
    backend: {
      chatRoute: router.activeRouteId,
      paused: router.paused,
      killSwitch: router.killSwitch,
      warmConfigured: router.routes["ocean-demo-vllm"].configured,
      warmBaseUrlConfigured: Boolean(router.warm.baseUrl),
      warmApiKeyConfigured: Boolean(router.warm.apiKey),
      warmModel: router.warm.model,
      warmProviderId: router.warm.providerId,
      selectedProviderConfigured: router.routes["ocean-provider"].configured,
      selectedProviderBaseUrlConfigured: Boolean(router.selectedProvider.baseUrl),
      selectedProviderApiKeyConfigured: Boolean(router.selectedProvider.apiKey),
      selectedProviderModel: router.selectedProvider.model,
      selectedProviderId: router.selectedProvider.providerId,
      externalConfigured: router.routes["external-fallback"].configured,
      externalBaseUrlConfigured: Boolean(router.external.baseUrl),
      externalApiKeyConfigured: Boolean(router.external.apiKey),
      externalModel: router.external.model,
      externalProviderId: router.external.providerId,
      oceanBatchConfigured,
      oceanBatchProviderId,
      concurrencyActiveRequests: concurrency.activeRequests,
      concurrencyActiveByRoute: concurrency.activeByRoute
    },
    guardrails: {
      ...router.guardrails,
      dailyUsdBudgets: router.budgets.dailyUsdByRoute,
      oceanBatchDailyBudgetUsd,
      maxConcurrentRequests: router.guardrails.maxConcurrentRequests,
      quotaStorage: "local-json",
      concurrencyStorage: "in-memory",
      rateLimitStorage: "in-memory"
    },
    modes: [
      {
        id: "mock",
        title: "Demo answer",
        state: router.routes.mock.status,
        short: "Local answer for the first version.",
        privacy: "No outside provider is called.",
        proof: "Demo usage record."
      },
      {
        id: "ocean-demo-vllm",
        title: "Ocean demo vLLM",
        state: router.routes["ocean-demo-vllm"].status,
        short: "OpenAI-compatible warm inference route on the demo node.",
        privacy: "Prompts go to the configured Ocean Navy demo vLLM endpoint.",
        proof: "Warm inference receipt with route, provider id, latency, and token counts."
      },
      {
        id: "ocean-provider",
        title: "Ocean providers",
        state: router.routes["ocean-provider"].status,
        short: "Selected Ocean providers run warm chat.",
        privacy: "Prompts go to the configured selected Ocean provider.",
        proof: "Fish usage record plus signed runner proof when the provider returns one."
      },
      {
        id: "external-fallback",
        title: "Outside AI",
        state: router.routes["external-fallback"].status,
        short: "Explicit fallback through an outside provider.",
        privacy: "Outside provider policy applies.",
        proof: "Outside AI usage record."
      },
      {
        id: "ocean-batch",
        title: "Batch kitchen",
        state: oceanBatchConfigured ? "ready" : "pilot",
        short: "Hash-only dish jobs for batch work.",
        privacy: "Fish sends input references, not raw order text.",
        proof: "Ocean batch receipt plus normal Fish usage record."
      },
      {
        id: "ocean-private",
        title: "Private Ocean lane",
        state: "future",
        short: "Ocean provider with reviewed privacy rules.",
        privacy: "Provider commits to no prompt/output retention.",
        proof: "Policy review plus usage records."
      },
      {
        id: "hardened-runner",
        title: "Stronger runner",
        state: "future",
        short: "Controlled runner with tighter isolation.",
        privacy: "Runner-level storage and access controls.",
        proof: "Runner logs without raw prompt text."
      },
      {
        id: "tee-runner",
        title: "Hardware proof",
        state: "future",
        short: "Hardware-backed route much later.",
        privacy: "Hardware-backed execution boundary.",
        proof: "Hardware proof plus provider proof."
      }
    ],
    features: listFishFeaturePolicies(router).map((feature) => ({
      id: feature.id,
      label: feature.label,
      state: feature.state,
      primary: feature.primary,
      fallback: feature.fallback,
      maxInputTokens: feature.maxInputTokens,
      maxOutputTokens: feature.maxOutputTokens,
      cap: feature.enabled
        ? `${feature.cap} / ${
            feature.id === "api"
              ? `${router.guardrails.dailyKeyedQuota} keyed orders/day`
              : feature.id === "docs"
                ? `${formatDailyBudget(oceanBatchDailyBudgetUsd)} batch daily`
                : `${formatDailyBudget(router.budgets.dailyUsdByRoute[router.activeRouteId])} daily`
          }`
        : feature.cap
    })),
    rules: [
      {
        title: "Name the route",
        body: "Mock, Ocean demo vLLM, selected Ocean provider, and external fallback work must be labeled differently."
      },
      {
        title: "Ocean proof is narrow",
        body: "The demo node and selected providers are labeled separately."
      },
      {
        title: "Caps before calls",
        body: "Input tokens, output tokens, minute limits, monthly request limits, daily quota, concurrent requests, daily route budget, and pause switches are checked before backend calls."
      },
      {
        title: "Usage stays clean",
        body: "Usage records keep hashes, costs, and provider ids, not raw prompts or outputs."
      },
      {
        title: "Privacy is explicit",
        body: "Outside AI can help launch, but that provider's privacy policy applies."
      }
    ],
    nextMilestone: "Operate selected Ocean providers with signed runner proof, then expand the provider allowlist."
  };
}

function formatDailyBudget(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function activeRoutePolicy(id: FishChatRouteId, status: RouteModeState): FishRoutePolicy["activeRoute"] {
  if (id === "ocean-demo-vllm") {
    return {
      id,
      label: "Ocean demo vLLM",
      isRealAi: true,
      privacy: "Prompts go to the configured Ocean Navy warm inference endpoint. Fish keeps usage numbers and a request hash.",
      evidence: "Marked as Ocean demo vLLM, not a generic external fallback.",
      status
    };
  }
  if (id === "external-fallback") {
    return {
      id,
      label: "External fallback",
      isRealAi: true,
      privacy: "Prompts go to the configured outside AI provider only when this route is explicitly enabled.",
      evidence: "Marked as fallback AI, not Ocean provider proof.",
      status
    };
  }
  if (id === "ocean-provider") {
    return {
      id,
      label: "Selected Ocean provider",
      isRealAi: true,
      privacy: "Prompts go to the configured selected Ocean provider. Fish keeps usage numbers, provider ids, and request hashes.",
      evidence: "Marked as selected Ocean provider work with runner proof when available.",
      status
    };
  }
  return {
    id,
    label: "Demo mock",
    isRealAi: false,
    privacy: "Demo answers stay inside the local app process.",
    evidence: "Marked as a demo estimate so nobody confuses it with provider work.",
    status
  };
}
