import { getFishRouterConfig } from "@/lib/fishRouter";
import type { DataState } from "@/lib/types";

type ProbeState = "ok" | "failed" | "skipped";

export type WarmInferenceStatus = {
  dataState: DataState;
  generatedAt: string;
  routeId: "ocean-demo-vllm";
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
  const warmRoute = router.routes["ocean-demo-vllm"];
  const warnings = [
    ...(router.warm.baseUrl ? [] : ["Warm vLLM base URL is not configured."]),
    ...(router.warm.model ? [] : ["Warm vLLM model is not configured."]),
    ...(router.warm.apiKey ? [] : ["Warm vLLM API key is not configured."]),
    ...(router.activeRouteId === "ocean-demo-vllm" && !warmRoute.configured ? ["Ocean demo route is selected but not ready."] : [])
  ];
  const base = baseStatus();

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
    const response = await fetch(modelsEndpoint(router.warm.baseUrl!), {
      headers: router.warm.apiKey ? { authorization: `Bearer ${router.warm.apiKey}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    const latencyMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => null);
    const modelVisible = response.ok ? modelListIncludes(payload, router.warm.model) : null;

    return {
      ...base,
      dataState: response.ok ? "live" : "unavailable",
      warnings: [
        ...warnings,
        ...(response.ok && modelVisible === false ? [`Configured model ${router.warm.model} was not visible in /models.`] : [])
      ],
      probe: {
        state: response.ok ? "ok" : "failed",
        latencyMs,
        statusCode: response.status,
        modelVisible,
        message: response.ok ? "Warm endpoint answered /models." : "Warm endpoint did not answer /models successfully."
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

  function baseStatus(): WarmInferenceStatus {
    return {
      dataState: warmRoute.configured ? "snapshot" : "unavailable",
      generatedAt: new Date().toISOString(),
      routeId: "ocean-demo-vllm",
      providerId: router.warm.providerId,
      routeActive: router.activeRouteId === "ocean-demo-vllm",
      configured: warmRoute.configured,
      baseUrlConfigured: Boolean(router.warm.baseUrl),
      apiKeyConfigured: Boolean(router.warm.apiKey),
      configuredModel: router.warm.model,
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
