import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRouteDailyBudget, releaseRouteDailyBudgetReservation, reserveRouteDailyBudget, type RouteBudgetReservation } from "./fishBudget";
import type { FishRouterConfig } from "./fishRouter";

const ESTIMATED_COST_USD = 0.002;

test("route budget reservations include in-flight provider calls", async () => {
  const config = testRouterConfig(100);
  const baseline = await checkRouteDailyBudget({
    route: "external-fallback",
    promptTokens: 1,
    maxOutputTokens: 1,
    routerConfig: config
  });
  config.budgets.dailyUsdByRoute["external-fallback"] = Number((baseline.spentUsd + ESTIMATED_COST_USD).toFixed(6));

  const reservations = await Promise.all(
    Array.from({ length: 3 }, () =>
      reserveRouteDailyBudget({
        route: "external-fallback",
        promptTokens: 1,
        maxOutputTokens: 1,
        routerConfig: config
      })
    )
  );

  const accepted = reservations.filter((reservation): reservation is RouteBudgetReservation => reservation.ok);
  const rejected = reservations.filter((reservation) => !reservation.ok);

  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 2);
  assert.equal(accepted[0].reservedUsd, 0);
  assert.equal(rejected[0].reservedUsd, ESTIMATED_COST_USD);

  await releaseRouteDailyBudgetReservation(accepted[0]);

  const afterRelease = await reserveRouteDailyBudget({
    route: "external-fallback",
    promptTokens: 1,
    maxOutputTokens: 1,
    routerConfig: config
  });
  assert.equal(afterRelease.ok, true);
  if (afterRelease.ok) {
    await releaseRouteDailyBudgetReservation(afterRelease);
  }
});

function testRouterConfig(externalBudgetUsd: number): FishRouterConfig {
  const routes = {
    mock: {
      id: "mock",
      label: "mock",
      publicLabel: "Demo mock",
      isRealAi: false,
      costState: "prototype_estimate",
      providerId: "fish-local-mock",
      status: "ready",
      configured: true,
      enabled: true
    },
    "ocean-demo-vllm": {
      id: "ocean-demo-vllm",
      label: "ocean-demo-vllm",
      publicLabel: "Ocean demo vLLM",
      isRealAi: true,
      costState: "provider_verified",
      providerId: "ocean-demo",
      status: "ready",
      configured: true,
      enabled: true
    },
    "ocean-provider": {
      id: "ocean-provider",
      label: "ocean-provider",
      publicLabel: "Selected Ocean provider",
      isRealAi: true,
      costState: "provider_verified",
      providerId: "ocean-provider",
      status: "ready",
      configured: true,
      enabled: true
    },
    "external-fallback": {
      id: "external-fallback",
      label: "external-fallback",
      publicLabel: "External fallback",
      isRealAi: true,
      costState: "fallback_verified",
      providerId: "external-compatible",
      status: "ready",
      configured: true,
      enabled: true
    }
  } satisfies FishRouterConfig["routes"];

  return {
    activeRouteId: "external-fallback",
    paused: false,
    killSwitch: false,
    guardrails: {
      maxInputTokens: 1000,
      maxOutputTokens: 512,
      dailyKeyedQuota: 20,
      dailyAnonymousQuota: 5,
      maxConcurrentRequests: 8,
      externalFallbackFreeAllowed: true
    },
    budgets: {
      dailyUsdByRoute: {
        mock: 0,
        "ocean-demo-vllm": 100,
        "ocean-provider": 100,
        "external-fallback": externalBudgetUsd
      }
    },
    warm: {
      baseUrl: "http://127.0.0.1:8088/v1",
      apiKey: "test",
      model: "fish-warm-chat",
      providerId: "ocean-demo",
      costUsdPer1kTokens: 1
    },
    selectedProvider: {
      baseUrl: "http://127.0.0.1:8089/v1",
      apiKey: "test",
      model: "fish-provider-chat",
      providerId: "ocean-provider",
      costUsdPer1kTokens: 1
    },
    external: {
      backend: "external",
      baseUrl: "http://127.0.0.1:8090/v1",
      apiKey: "test",
      model: "fish-external-chat",
      providerId: "external-compatible",
      costUsdPer1kTokens: 1
    },
    routes
  };
}
