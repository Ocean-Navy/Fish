import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getFishRoutePolicy } from "./routePolicy";

const FEATURE_CAP_ENV_KEYS = ["FISH_MAX_OUTPUT_TOKENS", "FISH_CODE_MAX_OUTPUT_TOKENS"] as const;

afterEach(() => {
  for (const key of FEATURE_CAP_ENV_KEYS) {
    delete process.env[key];
  }
});

test("route policy exposes per-feature output token caps below the global guardrail", () => {
  process.env.FISH_MAX_OUTPUT_TOKENS = "1200";
  process.env.FISH_CODE_MAX_OUTPUT_TOKENS = "800";

  const policy = getFishRoutePolicy();
  const codeFeature = policy.features.find((feature) => feature.id === "code");

  assert.equal(policy.guardrails.maxOutputTokens, 1200);
  assert.equal(codeFeature?.maxOutputTokens, 800);
});
