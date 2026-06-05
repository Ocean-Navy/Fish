import type { ChatCompletionInput } from "@/lib/fishLedger";

const DEFAULT_EXTERNAL_PROVIDER_ID = "external-compatible";

type ExternalChatConfig = {
  backend: "mock" | "external";
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  providerId: string;
  costUsdPer1kTokens: number;
};

type ExternalChatSuccess = {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  providerCostUsd: number;
  providerId: string;
};

export class ExternalChatError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function getExternalChatConfig(): ExternalChatConfig {
  const route = process.env.FISH_CHAT_ROUTE;
  const backend = process.env.FISH_CHAT_BACKEND;
  return {
    backend: route === "external-fallback" || backend === "external" ? "external" : "mock",
    baseUrl: cleanEnv(process.env.FISH_EXTERNAL_CHAT_BASE_URL),
    apiKey: cleanEnv(process.env.FISH_EXTERNAL_CHAT_API_KEY),
    model: cleanEnv(process.env.FISH_EXTERNAL_CHAT_MODEL),
    providerId: cleanEnv(process.env.FISH_EXTERNAL_PROVIDER_ID) ?? DEFAULT_EXTERNAL_PROVIDER_ID,
    costUsdPer1kTokens: Number(process.env.FISH_EXTERNAL_COST_USD_PER_1K_TOKENS ?? "0")
  };
}

export function isExternalChatEnabled(config = getExternalChatConfig()) {
  return config.backend === "external" && Boolean(config.baseUrl && config.apiKey && config.model);
}

export async function runExternalChat(input: ChatCompletionInput, fallbackTokenEstimate: { promptTokens: number; completionTokens: number }): Promise<ExternalChatSuccess> {
  const config = getExternalChatConfig();
  if (!isExternalChatEnabled(config)) {
    throw new ExternalChatError(503, "external_chat_not_configured");
  }

  const endpoint = `${config.baseUrl!.replace(/\/+$/, "")}/chat/completions`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
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
    throw new ExternalChatError(upstream.status === 401 ? 502 : upstream.status, "external_chat_backend_error");
  }

  const content = readAssistantContent(payload);
  if (!content) {
    throw new ExternalChatError(502, "external_chat_empty_response");
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

function cleanEnv(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}
