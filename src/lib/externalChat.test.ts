import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_EXTERNAL_CHAT_MAX_TOKENS, getExternalChatConfig, isExternalChatEnabled, runExternalChat } from "./externalChat";
import { getFishRouterConfig } from "./fishRouter";

const ENV_KEYS = [
  "FISH_CHAT_ROUTE",
  "FISH_CHAT_BACKEND",
  "FISH_EXTERNAL_CHAT_BASE_URL",
  "FISH_EXTERNAL_CHAT_API_KEY",
  "FISH_EXTERNAL_CHAT_MODEL",
  "FISH_EXTERNAL_PROVIDER_ID",
  "FISH_EXTERNAL_COST_USD_PER_1K_TOKENS"
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

test("external chat always forwards a max_tokens cap", async () => {
  const bodies: unknown[] = [];
  configureExternalChat();
  globalThis.fetch = mockExternalFetch(bodies);

  await runExternalChat(
    {
      model: "fish-demo-chat",
      messages: [{ role: "user", content: "hello" }],
      stream: false
    },
    { promptTokens: 1, completionTokens: 1 }
  );

  assert.equal((bodies[0] as { max_tokens?: number }).max_tokens, DEFAULT_EXTERNAL_CHAT_MAX_TOKENS);
});

test("external chat preserves caller max_tokens when provided", async () => {
  const bodies: unknown[] = [];
  configureExternalChat();
  globalThis.fetch = mockExternalFetch(bodies);

  await runExternalChat(
    {
      model: "fish-demo-chat",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      max_tokens: 37
    },
    { promptTokens: 1, completionTokens: 1 }
  );

  assert.equal((bodies[0] as { max_tokens?: number }).max_tokens, 37);
});

test("external credentials alone do not enable fallback for the Ocean demo route", () => {
  setExternalCredentials();
  process.env.FISH_CHAT_ROUTE = "ocean-demo-vllm";
  delete process.env.FISH_CHAT_BACKEND;

  const config = getExternalChatConfig();
  const routerConfig = getFishRouterConfig();

  assert.equal(config.backend, "mock");
  assert.equal(isExternalChatEnabled(config), false);
  assert.equal(routerConfig.routes["external-fallback"].configured, false);
});

test("external chat is enabled when explicitly selected by route", () => {
  setExternalCredentials();
  process.env.FISH_CHAT_ROUTE = "external-fallback";
  delete process.env.FISH_CHAT_BACKEND;

  const config = getExternalChatConfig();

  assert.equal(config.backend, "external");
  assert.equal(isExternalChatEnabled(config), true);
});

test("external fallback can be explicitly opted in with the backend selector", () => {
  setExternalCredentials();
  process.env.FISH_CHAT_ROUTE = "ocean-demo-vllm";
  process.env.FISH_CHAT_BACKEND = "external";

  const config = getExternalChatConfig();

  assert.equal(config.backend, "external");
  assert.equal(isExternalChatEnabled(config), true);
});

function configureExternalChat() {
  process.env.FISH_CHAT_ROUTE = "external-fallback";
  delete process.env.FISH_CHAT_BACKEND;
  setExternalCredentials();
}

function setExternalCredentials() {
  process.env.FISH_EXTERNAL_CHAT_BASE_URL = "https://example.test/v1";
  process.env.FISH_EXTERNAL_CHAT_API_KEY = "test-key";
  process.env.FISH_EXTERNAL_CHAT_MODEL = "external-model";
}

function mockExternalFetch(bodies: unknown[]) {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        model: "external-model",
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
}
