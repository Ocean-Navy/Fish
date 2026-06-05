import type { ChatCompletionInput, RunnerReceiptSummary } from "@/lib/fishLedger";
import { readAndVerifyRunnerReceipt } from "@/lib/runnerReceipts";

export type OpenAiCompatibleRouteConfig = {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  providerId: string;
  costUsdPer1kTokens: number;
};

export type OpenAiCompatibleChatSuccess = {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  providerCostUsd: number;
  providerId: string;
  runnerReceipt: RunnerReceiptSummary | null;
};

export type OpenAiCompatibleRouteContext = {
  routeId: string;
  idempotencyKey: string;
  maxBudgetUsd: number;
  timeoutMs?: number;
};

export class OpenAiCompatibleChatError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function isOpenAiCompatibleRouteConfigured(config: OpenAiCompatibleRouteConfig) {
  return Boolean(config.baseUrl && config.model);
}

export async function runOpenAiCompatibleChat(
  input: ChatCompletionInput,
  config: OpenAiCompatibleRouteConfig,
  fallbackTokenEstimate: { promptTokens: number; completionTokens: number },
  routeContext?: OpenAiCompatibleRouteContext
): Promise<OpenAiCompatibleChatSuccess> {
  if (!isOpenAiCompatibleRouteConfigured(config)) {
    throw new OpenAiCompatibleChatError(503, "openai_compatible_route_not_configured");
  }

  const endpoint = chatCompletionsEndpoint(config.baseUrl!);
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  if (routeContext) {
    headers["x-fish-route-id"] = routeContext.routeId;
    headers["x-fish-idempotency-key"] = routeContext.idempotencyKey;
    headers["x-fish-max-budget-usd"] = String(routeContext.maxBudgetUsd);
  }

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model ?? input.model,
      messages: input.messages,
      stream: false,
      ...(routeContext
        ? {
            metadata: {
              ...(input.metadata ?? {}),
              fish_route_id: routeContext.routeId,
              idempotency_key: routeContext.idempotencyKey,
              max_budget_usd: routeContext.maxBudgetUsd
            }
          }
        : input.metadata
          ? { metadata: input.metadata }
          : {}),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.max_tokens === undefined ? {} : { max_tokens: input.max_tokens })
    }),
    ...(routeContext?.timeoutMs ? { signal: AbortSignal.timeout(routeContext.timeoutMs) } : {})
  });

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    throw new OpenAiCompatibleChatError(upstream.status === 401 ? 502 : upstream.status, "openai_compatible_backend_error");
  }

  const content = readAssistantContent(payload);
  if (!content) {
    throw new OpenAiCompatibleChatError(502, "openai_compatible_empty_response");
  }

  const promptTokens = readNumber(payload, ["usage", "prompt_tokens"]);
  const completionTokens = readNumber(payload, ["usage", "completion_tokens"]);
  const totalTokens = (promptTokens ?? fallbackTokenEstimate.promptTokens) + (completionTokens ?? fallbackTokenEstimate.completionTokens);
  const providerCostUsd = Number(((totalTokens / 1000) * Math.max(0, config.costUsdPer1kTokens)).toFixed(6));

  return {
    content,
    model: readString(payload, ["model"]) ?? config.model ?? input.model,
    promptTokens,
    completionTokens,
    providerCostUsd,
    providerId: config.providerId,
    runnerReceipt: readAndVerifyRunnerReceipt(payload, {
      expectedRouteId: routeContext?.routeId,
      expectedProviderId: config.providerId,
      expectedStatus: "succeeded"
    })
  };
}

function chatCompletionsEndpoint(baseUrl: string) {
  const clean = baseUrl.replace(/\/+$/, "");
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

function readAssistantContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return null;
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content) ? content.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join("\n") : null;
}

function readNumber(payload: unknown, path: string[]) {
  const value = readPath(payload, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(payload: unknown, path: string[]) {
  const value = readPath(payload, path);
  return typeof value === "string" && value.trim() ? value : null;
}

function readPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const part of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
