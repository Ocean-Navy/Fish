import { getExternalChatConfig, isExternalChatEnabled } from "@/lib/externalChat";
import { isOpenAiCompatibleRouteConfigured, type OpenAiCompatibleRouteConfig } from "@/lib/openAiCompatibleChat";

export type FishChatRouteId = "mock" | "ocean-demo-vllm" | "external-fallback";
export type FishCostState = "prototype_estimate" | "provider_verified" | "fallback_verified";
export type FishRouteStatus = "active" | "ready" | "disabled" | "needs-config" | "paused";

export type FishRouteConfig = {
  id: FishChatRouteId;
  label: string;
  publicLabel: string;
  isRealAi: boolean;
  costState: FishCostState;
  providerId: string | null;
  status: FishRouteStatus;
  configured: boolean;
  enabled: boolean;
};

export type FishRouterConfig = {
  activeRouteId: FishChatRouteId;
  paused: boolean;
  killSwitch: boolean;
  guardrails: {
    maxInputTokens: number;
    maxOutputTokens: number;
    dailyKeyedQuota: number;
    dailyAnonymousQuota: number;
    externalFallbackFreeAllowed: boolean;
  };
  budgets: {
    dailyUsdByRoute: Record<FishChatRouteId, number>;
  };
  warm: OpenAiCompatibleRouteConfig;
  external: ReturnType<typeof getExternalChatConfig>;
  routes: Record<FishChatRouteId, FishRouteConfig>;
};

export function getFishRouterConfig(): FishRouterConfig {
  const warm = getWarmInferenceConfig();
  const external = getExternalChatConfig();
  const activeRouteId = normalizeRouteId(process.env.FISH_CHAT_ROUTE ?? process.env.FISH_CHAT_BACKEND);
  const paused = parseBoolean(process.env.FISH_CHAT_PAUSED) || parseBoolean(process.env.FISH_ROUTER_PAUSED);
  const killSwitch = parseBoolean(process.env.FISH_ROUTER_KILL_SWITCH) || parseBoolean(process.env.FISH_CHAT_KILL_SWITCH);
  const warmConfigured = isOpenAiCompatibleRouteConfigured(warm);
  const externalConfigured = isExternalChatEnabled(external);

  return {
    activeRouteId,
    paused,
    killSwitch,
    guardrails: {
      maxInputTokens: readPositiveInt(process.env.FISH_MAX_INPUT_TOKENS, 1000),
      maxOutputTokens: readPositiveInt(process.env.FISH_MAX_OUTPUT_TOKENS, 512),
      dailyKeyedQuota: readPositiveInt(process.env.FISH_DAILY_KEYED_QUOTA, 20),
      dailyAnonymousQuota: readPositiveInt(process.env.FISH_DAILY_ANONYMOUS_QUOTA, 5),
      externalFallbackFreeAllowed: parseBoolean(process.env.FISH_EXTERNAL_FALLBACK_FREE_ALLOWED)
    },
    budgets: {
      dailyUsdByRoute: {
        mock: readNonNegativeNumber(process.env.FISH_MOCK_DAILY_BUDGET_USD, 0),
        "ocean-demo-vllm": readNonNegativeNumber(process.env.FISH_OCEAN_DEMO_DAILY_BUDGET_USD, 50),
        "external-fallback": readNonNegativeNumber(process.env.FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD, 10)
      }
    },
    warm,
    external,
    routes: {
      mock: {
        id: "mock",
        label: "mock",
        publicLabel: "Demo mock",
        isRealAi: false,
        costState: "prototype_estimate",
        providerId: "fish-local-mock",
        status: activeRouteId === "mock" ? routeStatus(paused, killSwitch, true, true) : "ready",
        configured: true,
        enabled: true
      },
      "ocean-demo-vllm": {
        id: "ocean-demo-vllm",
        label: "ocean-demo-vllm",
        publicLabel: "Ocean demo vLLM",
        isRealAi: true,
        costState: "provider_verified",
        providerId: warm.providerId,
        status: activeRouteId === "ocean-demo-vllm" ? routeStatus(paused, killSwitch, true, warmConfigured) : warmConfigured ? "ready" : "needs-config",
        configured: warmConfigured,
        enabled: true
      },
      "external-fallback": {
        id: "external-fallback",
        label: "external-fallback",
        publicLabel: "External fallback",
        isRealAi: true,
        costState: "fallback_verified",
        providerId: external.providerId,
        status: activeRouteId === "external-fallback" ? routeStatus(paused, killSwitch, true, externalConfigured) : externalConfigured ? "ready" : "needs-config",
        configured: externalConfigured,
        enabled: true
      }
    }
  };
}

export function getActiveFishRoute(config = getFishRouterConfig()) {
  return config.routes[config.activeRouteId];
}

export function getWarmInferenceConfig(): OpenAiCompatibleRouteConfig {
  return {
    baseUrl: cleanEnv(process.env.FISH_OCEAN_DEMO_VLLM_BASE_URL),
    apiKey: cleanEnv(process.env.FISH_OCEAN_DEMO_VLLM_API_KEY),
    model: cleanEnv(process.env.FISH_OCEAN_DEMO_VLLM_MODEL),
    providerId: cleanEnv(process.env.FISH_OCEAN_DEMO_PROVIDER_ID) ?? "ocean-navy-demo-node",
    costUsdPer1kTokens: Number(process.env.FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS ?? "0")
  };
}

function normalizeRouteId(value: string | undefined): FishChatRouteId {
  if (
    value === "ocean-demo-vllm" ||
    value === "ocean_demo_vllm" ||
    value === "vllm" ||
    value === "ocean-first" ||
    value === "ocean_first" ||
    value === "hybrid" ||
    value === "ocean-first-hybrid"
  ) {
    return "ocean-demo-vllm";
  }
  if (value === "external" || value === "external-fallback" || value === "external_fallback") {
    return "external-fallback";
  }
  return "mock";
}

function routeStatus(paused: boolean, killSwitch: boolean, enabled: boolean, configured: boolean): FishRouteStatus {
  if (killSwitch || !enabled) {
    return "disabled";
  }
  if (paused) {
    return "paused";
  }
  return configured ? "active" : "needs-config";
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function cleanEnv(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}
