import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DEFAULT_EXTERNAL_CHAT_MAX_TOKENS, runExternalChat } from "./externalChat";

const EXTERNAL_ENV_KEYS = [
  "FISH_CHAT_ROUTE",
  "FISH_CHAT_BACKEND",
  "FISH_EXTERNAL_CHAT_BASE_URL",
  "FISH_EXTERNAL_CHAT_API_KEY",
  "FISH_EXTERNAL_CHAT_MODEL",
  "FISH_EXTERNAL_PROVIDER_ID",
  "FISH_EXTERNAL_COST_USD_PER_1K_TOKENS"
] as const;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of EXTERNAL_ENV_KEYS) {
    delete process.env[key];
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

function configureExternalChat() {
  process.env.FISH_CHAT_ROUTE = "external-fallback";
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
