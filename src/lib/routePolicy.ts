import { listFishFeaturePolicies, type FishFeatureId } from "@/lib/fishFeaturePolicy";
import { getFishRouterConfig, type FishChatRouteId } from "@/lib/fishRouter";
import type { DataState } from "@/lib/types";

export type RouteModeId = FishChatRouteId | "selected-ocean-provider" | "ocean-private" | "hardened-runner" | "tee-runner";
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
    externalConfigured: boolean;
    externalBaseUrlConfigured: boolean;
    externalApiKeyConfigured: boolean;
    externalModel: string | null;
    externalProviderId: string;
  };
  guardrails: {
    maxInputTokens: number;
    maxOutputTokens: number;
    dailyKeyedQuota: number;
    dailyAnonymousQuota: number;
    externalFallbackFreeAllowed: boolean;
    dailyUsdBudgets: Record<FishChatRouteId, number>;
    quotaStorage: "local-json";
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
      externalConfigured: router.routes["external-fallback"].configured,
      externalBaseUrlConfigured: Boolean(router.external.baseUrl),
      externalApiKeyConfigured: Boolean(router.external.apiKey),
      externalModel: router.external.model,
      externalProviderId: router.external.providerId
    },
    guardrails: {
      ...router.guardrails,
      dailyUsdBudgets: router.budgets.dailyUsdByRoute,
      quotaStorage: "local-json"
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
        id: "external-fallback",
        title: "Outside AI",
        state: router.routes["external-fallback"].status,
        short: "Explicit fallback through an outside provider.",
        privacy: "Outside provider policy applies.",
        proof: "Outside AI usage record."
      },
      {
        id: "selected-ocean-provider",
        title: "Ocean providers",
        state: "pilot",
        short: "Selected Ocean providers run jobs.",
        privacy: "Provider terms and Fish routing policy apply.",
        proof: "Signed provider proof."
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
      cap: feature.enabled
        ? `${feature.cap} / ${feature.id === "api" ? `${router.guardrails.dailyKeyedQuota} keyed orders/day` : `${formatDailyBudget(router.budgets.dailyUsdByRoute["ocean-demo-vllm"])} daily`}`
        : feature.cap
    })),
    rules: [
      {
        title: "Name the route",
        body: "Mock, Ocean demo vLLM, and external fallback work must be labeled differently."
      },
      {
        title: "Ocean proof is narrow",
        body: "The warm demo node is labeled separately from the future selected-provider market."
      },
      {
        title: "Caps before calls",
        body: "Input tokens, output tokens, daily quota, daily route budget, and pause switches are checked before backend calls."
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
    nextMilestone: "Operate the warm demo node, then connect selected Ocean provider jobs behind an allowlist and public-safe proof."
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
  return {
    id,
    label: "Demo mock",
    isRealAi: false,
    privacy: "Demo answers stay inside the local app process.",
    evidence: "Marked as a demo estimate so nobody confuses it with provider work.",
    status
  };
}
