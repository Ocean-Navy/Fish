import { getFishRouterConfig, type FishChatRouteId } from "@/lib/fishRouter";
import type { OpenAiCompatibleRouteConfig } from "@/lib/openAiCompatibleChat";
import type { DataState } from "@/lib/types";

type ProbeState = "ok" | "failed" | "skipped";
type WarmRouteId = Extract<FishChatRouteId, "ocean-demo-vllm" | "ocean-provider">;

export type WarmInferenceStatus = {
  dataState: DataState;
  generatedAt: string;
  routeId: WarmRouteId;
  publicLabel: string;
  providerId: string;
  routeActive: boolean;
  configured: boolean;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  configuredModel: string | null;
  probe: {
    state: ProbeState;
    latencyMs: number | null;
    statusCode: number | null;
    modelVisible: boolean | null;
    message: string;
  };
  guardrails: {
    maxInputTokens: number;
    maxOutputTokens: number;
    dailyKeyedQuota: number;
    dailyAnonymousQuota: number;
    externalFallbackFreeAllowed: boolean;
  };
  warnings: string[];
};

export async function getWarmInferenceStatus({ probe = true, timeoutMs = 1500 }: { probe?: boolean; timeoutMs?: number } = {}): Promise<WarmInferenceStatus> {
  const router = getFishRouterConfig();
  const activeWarmRouteId: WarmRouteId = router.activeRouteId === "ocean-provider" ? "ocean-provider" : "ocean-demo-vllm";
  const warmRoute = router.routes[activeWarmRouteId];
  const routeConfig = activeWarmRouteId === "ocean-provider" ? router.selectedProvider : router.warm;
  const routeName = activeWarmRouteId === "ocean-provider" ? "Selected Ocean provider" : "Warm vLLM";
  const warnings = [
    ...(routeConfig.baseUrl ? [] : [`${routeName} base URL is not configured.`]),
    ...(routeConfig.model ? [] : [`${routeName} model is not configured.`]),
    ...(routeConfig.apiKey ? [] : [`${routeName} API key is not configured.`]),
    ...(router.activeRouteId === activeWarmRouteId && !warmRoute.configured ? [`${warmRoute.publicLabel} route is selected but not ready.`] : [])
  ];
  const base = baseStatus({ routeId: activeWarmRouteId, routeConfig });

  if (!warmRoute.configured || !probe) {
    return {
      ...base,
      warnings,
      probe: {
        state: "skipped",
        latencyMs: null,
        statusCode: null,
        modelVisible: null,
        message: warmRoute.configured ? "Probe skipped." : "Warm route is not configured."
      }
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(modelsEndpoint(routeConfig.baseUrl!), {
      headers: routeConfig.apiKey ? { authorization: `Bearer ${routeConfig.apiKey}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    const latencyMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => null);
    const modelVisible = response.ok ? modelListIncludes(payload, routeConfig.model) : null;

    return {
      ...base,
      dataState: response.ok ? "live" : "unavailable",
      warnings: [
        ...warnings,
        ...(response.ok && modelVisible === false ? [`Configured model ${routeConfig.model} was not visible in /models.`] : [])
      ],
      probe: {
        state: response.ok ? "ok" : "failed",
        latencyMs,
        statusCode: response.status,
        modelVisible,
        message: response.ok ? `${warmRoute.publicLabel} endpoint answered /models.` : `${warmRoute.publicLabel} endpoint did not answer /models successfully.`
      }
    };
  } catch {
    return {
      ...base,
      dataState: "unavailable",
      warnings,
      probe: {
        state: "failed",
        latencyMs: Date.now() - startedAt,
        statusCode: null,
        modelVisible: null,
        message: "Warm endpoint probe failed."
      }
    };
  }

  function baseStatus(input: { routeId: WarmRouteId; routeConfig: OpenAiCompatibleRouteConfig }): WarmInferenceStatus {
    return {
      dataState: warmRoute.configured ? "snapshot" : "unavailable",
      generatedAt: new Date().toISOString(),
      routeId: input.routeId,
      publicLabel: warmRoute.publicLabel,
      providerId: input.routeConfig.providerId,
      routeActive: router.activeRouteId === input.routeId,
      configured: warmRoute.configured,
      baseUrlConfigured: Boolean(input.routeConfig.baseUrl),
      apiKeyConfigured: Boolean(input.routeConfig.apiKey),
      configuredModel: input.routeConfig.model,
      probe: {
        state: "skipped",
        latencyMs: null,
        statusCode: null,
        modelVisible: null,
        message: "Probe not run."
      },
      guardrails: router.guardrails,
      warnings
    };
  }
}

function modelsEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function modelListIncludes(payload: unknown, configuredModel: string | null) {
  if (!configuredModel || !payload || typeof payload !== "object") {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return null;
  }
  return data.some((entry) => entry && typeof entry === "object" && (entry as { id?: unknown }).id === configuredModel);
}
