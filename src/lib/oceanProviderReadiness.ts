import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getFishRouterConfig } from "@/lib/fishRouter";
import { runOpenAiCompatibleChat, type OpenAiCompatibleRouteConfig } from "@/lib/openAiCompatibleChat";
import { collectProviderPilotRegistry, resolveProviderJobEndpoint } from "@/lib/providerPilot";
import type { DataState } from "@/lib/types";

const readinessRequestSchema = z.object({
  probeModels: z.boolean().optional().default(true),
  probeChat: z.boolean().optional().default(false),
  timeoutMs: z.number().int().min(250).max(30000).optional().default(3000),
  workloadType: z.string().trim().min(1).max(80).optional().default("chat_batch"),
  model: z.string().trim().min(1).max(120).optional()
});

type ProbeState = "ok" | "failed" | "skipped";
type ReadinessStatus = "ready" | "needs-config" | "needs-proof" | "failed";

type ReadinessCheck = {
  id: string;
  label: string;
  ready: boolean;
  requiredFor: "traffic" | "proof" | "operator";
  detail: string;
};

type EndpointProbe = {
  state: ProbeState;
  latencyMs: number | null;
  statusCode: number | null;
  modelVisible: boolean | null;
  message: string;
};

type ChatProbe = {
  state: ProbeState;
  latencyMs: number | null;
  model: string | null;
  contentHash: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  providerCostUsd: number | null;
  runnerSignatureState: string | null;
  runnerReceiptHash: string | null;
  message: string;
};

export type OceanProviderReadiness = {
  object: "selected_ocean_provider_readiness";
  dataState: DataState;
  generatedAt: string;
  status: ReadinessStatus;
  trafficReady: boolean;
  proofJobReady: boolean;
  provider: {
    providerId: string;
    publicLabel: string;
  };
  route: {
    routeId: "ocean-provider";
    routeActive: boolean;
    paused: boolean;
    killSwitch: boolean;
    configured: boolean;
    baseUrlConfigured: boolean;
    apiKeyConfigured: boolean;
    configuredModel: string | null;
  };
  pilot: {
    allowlisted: boolean;
    allowedForWorkload: boolean;
    allowedForModel: boolean;
    jobEndpointConfigured: boolean;
    workloadType: string;
    checkedModel: string;
  };
  probes: {
    models: EndpointProbe;
    chat: ChatProbe;
  };
  checks: ReadinessCheck[];
  warnings: string[];
  nextActions: string[];
};

export type OceanProviderReadinessInput = z.infer<typeof readinessRequestSchema>;

export function parseOceanProviderReadinessRequest(body: unknown) {
  return readinessRequestSchema.safeParse(body);
}

export async function checkOceanProviderReadiness(input: OceanProviderReadinessInput): Promise<OceanProviderReadiness> {
  const router = getFishRouterConfig();
  const route = router.routes["ocean-provider"];
  const config = router.selectedProvider;
  const registry = await collectProviderPilotRegistry();
  const checkedModel = input.model ?? config.model ?? "fish-demo-chat";
  const allowlistEntry = registry.allowlist.find((entry) => entry.providerId === config.providerId);
  const allowedForWorkload = Boolean(allowlistEntry?.allowedWorkloadTypes.includes(input.workloadType));
  const allowedForModel = Boolean(allowlistEntry?.allowedModels.includes(checkedModel));
  const jobEndpoint = await resolveProviderJobEndpoint(config.providerId);
  const modelsProbe = input.probeModels ? await probeModels(config, input.timeoutMs) : skippedModelsProbe("Models probe skipped.");
  const chatProbe = input.probeChat ? await probeChat(config, input.timeoutMs) : skippedChatProbe("Chat probe skipped. Set probeChat=true to prove the selected provider can answer.");

  const routeReady = route.configured && !router.paused && !router.killSwitch && router.activeRouteId === "ocean-provider";
  const trafficReady = routeReady && modelsProbe.state === "ok" && chatProbe.state === "ok";
  const proofJobReady = Boolean(allowlistEntry && allowedForWorkload && allowedForModel && jobEndpoint);
  const checks: ReadinessCheck[] = [
    {
      id: "selected_route_active",
      label: "Selected provider route active",
      ready: router.activeRouteId === "ocean-provider",
      requiredFor: "traffic",
      detail: router.activeRouteId === "ocean-provider" ? "FISH_CHAT_ROUTE selects ocean-provider." : `Current route is ${router.activeRouteId}.`
    },
    {
      id: "route_configured",
      label: "Runner URL and model configured",
      ready: route.configured,
      requiredFor: "traffic",
      detail: route.configured ? "Selected provider base URL and model are present." : "Set FISH_OCEAN_PROVIDER_BASE_URL and FISH_OCEAN_PROVIDER_MODEL."
    },
    {
      id: "route_unpaused",
      label: "Router open",
      ready: !router.paused && !router.killSwitch,
      requiredFor: "traffic",
      detail: router.killSwitch ? "Router kill switch is on." : router.paused ? "Router is paused." : "Router is not paused or disabled."
    },
    {
      id: "models_probe",
      label: "Provider models visible",
      ready: modelsProbe.state === "ok",
      requiredFor: "traffic",
      detail: modelsProbe.message
    },
    {
      id: "chat_probe",
      label: "Provider answers a tiny chat",
      ready: chatProbe.state === "ok",
      requiredFor: "traffic",
      detail: chatProbe.message
    },
    {
      id: "provider_allowlisted",
      label: "Provider allowlisted",
      ready: Boolean(allowlistEntry),
      requiredFor: "proof",
      detail: allowlistEntry ? "Provider is in the selected-provider allowlist." : "Add the provider to data/provider_allowlist.json or FISH_PROVIDER_ALLOWLIST."
    },
    {
      id: "workload_allowed",
      label: "Workload allowed",
      ready: allowedForWorkload,
      requiredFor: "proof",
      detail: allowedForWorkload ? `${input.workloadType} is allowlisted.` : `${input.workloadType} is not allowlisted for this provider.`
    },
    {
      id: "model_allowed",
      label: "Model allowed",
      ready: allowedForModel,
      requiredFor: "proof",
      detail: allowedForModel ? `${checkedModel} is allowlisted.` : `${checkedModel} is not allowlisted for provider proof jobs.`
    },
    {
      id: "job_endpoint_configured",
      label: "Provider proof endpoint configured",
      ready: Boolean(jobEndpoint),
      requiredFor: "proof",
      detail: jobEndpoint ? "A private provider job endpoint is configured." : "Set provider jobEndpoint in allowlist or FISH_PROVIDER_JOB_ENDPOINTS."
    },
    {
      id: "api_key_configured",
      label: "Provider API key configured",
      ready: Boolean(config.apiKey),
      requiredFor: "operator",
      detail: config.apiKey ? "FISH_OCEAN_PROVIDER_API_KEY is present." : "No provider API key is configured; only use this if the private endpoint is otherwise protected."
    }
  ];

  const status = trafficReady ? "ready" : route.configured ? (input.probeChat ? "failed" : "needs-proof") : "needs-config";
  const warnings = buildWarnings(checks, input.probeChat, modelsProbe, chatProbe);
  return {
    object: "selected_ocean_provider_readiness",
    dataState: trafficReady ? "live" : route.configured ? "snapshot" : "unavailable",
    generatedAt: new Date().toISOString(),
    status,
    trafficReady,
    proofJobReady,
    provider: {
      providerId: config.providerId,
      publicLabel: route.publicLabel
    },
    route: {
      routeId: "ocean-provider",
      routeActive: router.activeRouteId === "ocean-provider",
      paused: router.paused,
      killSwitch: router.killSwitch,
      configured: route.configured,
      baseUrlConfigured: Boolean(config.baseUrl),
      apiKeyConfigured: Boolean(config.apiKey),
      configuredModel: config.model
    },
    pilot: {
      allowlisted: Boolean(allowlistEntry),
      allowedForWorkload,
      allowedForModel,
      jobEndpointConfigured: Boolean(jobEndpoint),
      workloadType: input.workloadType,
      checkedModel
    },
    probes: {
      models: modelsProbe,
      chat: chatProbe
    },
    checks,
    warnings,
    nextActions: buildNextActions(checks, input.probeChat)
  };
}

async function probeModels(config: OpenAiCompatibleRouteConfig, timeoutMs: number): Promise<EndpointProbe> {
  if (!config.baseUrl || !config.model) {
    return skippedModelsProbe("Selected provider base URL or model is not configured.");
  }
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    const modelVisible = response.ok ? modelListIncludes(payload, config.model) : null;
    return {
      state: response.ok ? "ok" : "failed",
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      modelVisible,
      message: response.ok ? "Selected provider answered /models." : "Selected provider did not answer /models successfully."
    };
  } catch {
    return {
      state: "failed",
      latencyMs: Date.now() - startedAt,
      statusCode: null,
      modelVisible: null,
      message: "Selected provider /models probe failed."
    };
  }
}

async function probeChat(config: OpenAiCompatibleRouteConfig, timeoutMs: number): Promise<ChatProbe> {
  if (!config.baseUrl || !config.model) {
    return skippedChatProbe("Selected provider base URL or model is not configured.");
  }
  const startedAt = Date.now();
  try {
    const result = await runOpenAiCompatibleChat(
      {
        model: config.model,
        stream: false,
        max_tokens: 24,
        temperature: 0,
        metadata: {
          fish_probe: "selected_ocean_provider_readiness"
        },
        messages: [
          {
            role: "user",
            content: "Reply with the single word ready."
          }
        ]
      },
      config,
      {
        promptTokens: 8,
        completionTokens: 4
      },
      {
        routeId: "ocean-provider",
        idempotencyKey: `readiness_${randomUUID()}`,
        maxBudgetUsd: 0.05,
        timeoutMs
      }
    );
    return {
      state: "ok",
      latencyMs: Date.now() - startedAt,
      model: result.model,
      contentHash: hashContent(result.content),
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      providerCostUsd: result.providerCostUsd,
      runnerSignatureState: result.runnerReceipt?.signatureState ?? null,
      runnerReceiptHash: result.runnerReceipt?.canonicalReceiptHash ?? null,
      message: "Selected provider answered a tiny chat request."
    };
  } catch (error) {
    return {
      state: "failed",
      latencyMs: Date.now() - startedAt,
      model: null,
      contentHash: null,
      promptTokens: null,
      completionTokens: null,
      providerCostUsd: null,
      runnerSignatureState: null,
      runnerReceiptHash: null,
      message: error instanceof Error ? error.message : "Selected provider chat probe failed."
    };
  }
}

function skippedModelsProbe(message: string): EndpointProbe {
  return {
    state: "skipped",
    latencyMs: null,
    statusCode: null,
    modelVisible: null,
    message
  };
}

function skippedChatProbe(message: string): ChatProbe {
  return {
    state: "skipped",
    latencyMs: null,
    model: null,
    contentHash: null,
    promptTokens: null,
    completionTokens: null,
    providerCostUsd: null,
    runnerSignatureState: null,
    runnerReceiptHash: null,
    message
  };
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

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function buildWarnings(checks: ReadinessCheck[], probeChat: boolean, modelsProbe: EndpointProbe, chatProbe: ChatProbe) {
  return [
    ...checks.filter((check) => !check.ready && check.requiredFor !== "operator").map((check) => check.detail),
    ...(probeChat ? [] : ["No chat probe was run. Traffic readiness stays unproven until probeChat=true succeeds."]),
    ...(modelsProbe.state === "ok" && modelsProbe.modelVisible === false ? ["Configured model was not visible in /models."] : []),
    ...(chatProbe.state === "ok" && !chatProbe.runnerReceiptHash ? ["Provider answered, but no signed Fish Runner receipt was returned."] : [])
  ];
}

function buildNextActions(checks: ReadinessCheck[], probeChat: boolean) {
  const actions = checks
    .filter((check) => !check.ready && check.requiredFor !== "operator")
    .map((check) => check.detail)
    .slice(0, 6);
  if (!probeChat) {
    actions.unshift("Run this endpoint with probeChat=true before claiming selected-provider traffic is live.");
  }
  return actions.length ? actions : ["Selected provider traffic is ready. Run a normal /v1/chat/completions smoke with a team-api or provider-test key next."];
}
