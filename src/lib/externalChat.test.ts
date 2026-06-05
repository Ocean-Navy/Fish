import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getExternalChatConfig, isExternalChatEnabled } from "./externalChat";
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

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
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

function setExternalCredentials() {
  process.env.FISH_EXTERNAL_CHAT_BASE_URL = "https://example.invalid/v1";
  process.env.FISH_EXTERNAL_CHAT_API_KEY = "test-key";
  process.env.FISH_EXTERNAL_CHAT_MODEL = "test-model";
}
