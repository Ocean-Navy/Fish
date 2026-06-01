import type { ChatCompletionInput } from "@/lib/fishLedger";

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
  fallbackTokenEstimate: { promptTokens: number; completionTokens: number }
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

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model ?? input.model,
      messages: input.messages,
      stream: false,
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.max_tokens === undefined ? {} : { max_tokens: input.max_tokens })
    })
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
    providerId: config.providerId
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
