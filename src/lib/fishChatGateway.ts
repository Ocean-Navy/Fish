import {
  buildMockCompletion,
  checkFishModelAccess,
  estimateTokens,
  getFishPlan,
  recordChatUsage,
  releaseFishCreditReservation,
  reserveFishCredits,
  type Account,
  type ChatCompletionInput,
  type CreditReservation,
  type Ledger,
  type RunnerReceiptSummary
} from "@/lib/fishLedger";
import { ExternalChatError, runExternalChat } from "@/lib/externalChat";
import { getFishFeaturePolicy } from "@/lib/fishFeaturePolicy";
import { checkRouteDailyBudget, type RouteBudgetCheck } from "@/lib/fishBudget";
import { spendDailyQuota } from "@/lib/fishQuota";
import { getActiveFishRoute, getFishRouterConfig, type FishChatRouteId, type FishCostState, type FishRouterConfig } from "@/lib/fishRouter";
import { VllmChatError, runVllmChat } from "@/lib/vllmChat";

export type FishChatGatewayContext = {
  ledger: Ledger;
  account: Account;
  principalId: string;
  dailyQuotaLimit: number;
  allowExternalFallback: boolean;
};

export type FishChatGatewayResult =
  | {
      ok: true;
      body: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

type FishChatGatewayError = Extract<FishChatGatewayResult, { ok: false }>;

export async function runFishChatGateway(input: ChatCompletionInput, context: FishChatGatewayContext): Promise<FishChatGatewayResult> {
  if (input.stream) {
    return jsonError(400, "streaming_is_not_enabled_in_the_v1_prototype", "unsupported_feature");
  }

  const promptText = input.messages.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n");
  const routerConfig = getFishRouterConfig();
  const featurePolicy = getFishFeaturePolicy(input.metadata, routerConfig, input.model);
  const modelAccess = checkFishModelAccess(input.model, context.account.planId);
  const activeRoute = getActiveFishRoute(routerConfig);
  if (routerConfig.killSwitch || routerConfig.paused) {
    return jsonError(503, routerConfig.killSwitch ? "fish_router_disabled" : "fish_router_paused", "router_unavailable", {
      route: activeRoute.id
    });
  }

  if (!modelAccess.ok) {
    return jsonError(modelAccess.status, modelAccess.error, "model_error", {
      model: modelAccess.model,
      planId: modelAccess.plan.planId,
      ...(modelAccess.status === 400 ? { availableModels: modelAccess.availableModels } : { allowedModels: modelAccess.allowedModels })
    });
  }

  let content = "";
  let responseModel = input.model;
  let promptTokens = estimateTokens(promptText);
  let completionTokens = 0;
  let providerCostUsd = 0;
  let route: FishChatRouteId = activeRoute.id;
  const requestedRoute: FishChatRouteId = activeRoute.id;
  let fallbackFrom: FishChatRouteId | null = null;
  let fallbackReason: string | null = null;
  let costState: FishCostState = activeRoute.costState;
  let providerId: string | null = activeRoute.providerId;
  let runnerReceipt: RunnerReceiptSummary | null = null;
  const requestedMaxOutputTokens = input.max_tokens ?? featurePolicy.maxOutputTokens;

  if (!featurePolicy.enabled) {
    return jsonError(501, "fish_feature_not_enabled", "feature_not_enabled", {
      feature: featurePolicy.id,
      label: featurePolicy.label
    });
  }

  if (!activeRoute.configured && activeRoute.id === "ocean-demo-vllm" && canUseExternalFallback(routerConfig, context)) {
    route = "external-fallback";
    fallbackFrom = activeRoute.id;
    fallbackReason = "primary_not_configured";
    costState = "fallback_verified";
    providerId = routerConfig.routes["external-fallback"].providerId;
  } else if (!activeRoute.configured) {
    return jsonError(503, routeNotConfiguredMessage(activeRoute.id), "routing_policy_error", { route });
  }

  if (promptTokens > featurePolicy.maxInputTokens) {
    return jsonError(400, "max_input_tokens_exceeded", "guardrail_error", {
      feature: featurePolicy.id,
      limit: featurePolicy.maxInputTokens,
      estimated: promptTokens
    });
  }

  if (requestedMaxOutputTokens > featurePolicy.maxOutputTokens) {
    return jsonError(400, "max_output_tokens_exceeded", "guardrail_error", {
      feature: featurePolicy.id,
      limit: featurePolicy.maxOutputTokens,
      requested: requestedMaxOutputTokens
    });
  }

  if (route === "external-fallback" && !canUseExternalFallback(routerConfig, context)) {
    return jsonError(403, "external_fallback_not_allowed_for_plan", "routing_policy_error", { route });
  }

  let budgetCheck = await checkRouteDailyBudget({
    route,
    promptTokens,
    maxOutputTokens: requestedMaxOutputTokens,
    routerConfig
  });
  if (!budgetCheck.ok) {
    return budgetExceededError(budgetCheck);
  }

  const estimatedMaxCredits = Math.max(1, Math.ceil((promptTokens + requestedMaxOutputTokens) / 1000));
  if (context.account.creditBalance < estimatedMaxCredits) {
    return jsonError(402, "insufficient_fish_credits", "billing_error", {
      needed: estimatedMaxCredits,
      available: context.account.creditBalance
    });
  }

  const quota = await spendDailyQuota(context.principalId, route, context.dailyQuotaLimit);
  if (!quota.ok) {
    return jsonError(quota.status, quota.error, "quota_error", {
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining
    });
  }

  const reservationResult = await reserveFishCredits({
    ledger: context.ledger,
    account: context.account,
    credits: estimatedMaxCredits,
    reason: "credit_reserve_before_backend_call"
  });
  if (!reservationResult.ok) {
    return jsonError(reservationResult.status, reservationResult.error, "billing_error", {
      needed: reservationResult.needed,
      available: reservationResult.available
    });
  }
  const reservation = reservationResult.reservation;

  const routeInput = { ...input, max_tokens: requestedMaxOutputTokens };
  const startedAt = Date.now();
  if (route === "ocean-demo-vllm") {
    try {
      const warm = await runVllmChat(routeInput, {
        promptTokens,
        completionTokens: estimateTokens("")
      });
      content = warm.content;
      responseModel = warm.model;
      promptTokens = warm.promptTokens ?? promptTokens;
      completionTokens = warm.completionTokens ?? estimateTokens(content);
      providerCostUsd = warm.providerCostUsd;
      providerId = warm.providerId;
      runnerReceipt = warm.runnerReceipt;
    } catch (error) {
      if (!canUseExternalFallback(routerConfig, context)) {
        const message = error instanceof VllmChatError ? error.message : "ocean_demo_vllm_backend_error";
        return releaseReservationAndReturn(
          context,
          reservation,
          jsonError(error instanceof VllmChatError ? error.status : 502, message, "warm_inference_backend_error", { route }),
          "credit_reserve_release_backend_error"
        );
      }

      const fallbackBudgetCheck = await checkRouteDailyBudget({
        route: "external-fallback",
        promptTokens,
        maxOutputTokens: requestedMaxOutputTokens,
        routerConfig
      });
      if (!fallbackBudgetCheck.ok) {
        return releaseReservationAndReturn(context, reservation, budgetExceededError(fallbackBudgetCheck), "credit_reserve_release_fallback_budget_error");
      }
      budgetCheck = fallbackBudgetCheck;

      const fallback = await runExternalFallback(routeInput, promptTokens);
      if (!fallback.ok) {
        return releaseReservationAndReturn(context, reservation, fallback, "credit_reserve_release_fallback_error");
      }
      ({ content, responseModel, promptTokens, completionTokens, providerCostUsd, providerId, runnerReceipt } = fallback);
      fallbackFrom = "ocean-demo-vllm";
      fallbackReason = "primary_backend_error";
      route = "external-fallback";
      costState = "fallback_verified";
    }
  } else if (route === "external-fallback") {
    const fallback = await runExternalFallback(routeInput, promptTokens);
    if (!fallback.ok) {
      return releaseReservationAndReturn(context, reservation, fallback, "credit_reserve_release_fallback_error");
    }
    ({ content, responseModel, promptTokens, completionTokens, providerCostUsd, providerId, runnerReceipt } = fallback);
    costState = "fallback_verified";
  } else {
    content = buildMockCompletion(routeInput);
    completionTokens = estimateTokens(content);
  }
  const latencyMs = Date.now() - startedAt;

  const usage = await recordChatUsage({
    ledger: context.ledger,
    account: context.account,
    input,
    model: responseModel,
    promptTokens,
    completionTokens,
    content,
    route,
    costState,
    status: "succeeded",
    latencyMs,
    providerCostUsd,
    providerId,
    requestedRoute,
    fallbackFrom,
    fallbackReason,
    runnerReceipt,
    reservation
  });

  if (!usage.ok) {
    return jsonError(usage.status, usage.error, "billing_error", {
      needed: usage.needed,
      available: usage.available
    });
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    body: {
      id: `chatcmpl_${usage.receipt.id}`,
      object: "chat.completion",
      created: now,
      model: responseModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      },
      fish: {
        route: usage.receipt.route,
        requestedRoute: usage.receipt.requestedRoute,
        fallbackFrom: usage.receipt.fallbackFrom,
        fallbackReason: usage.receipt.fallbackReason,
        feature: usage.receipt.feature,
        featureLabel: featurePolicy.label,
        costState: usage.receipt.costState,
        receiptId: usage.receipt.id,
        status: usage.receipt.status,
        routeLabel: routerConfig.routes[route].publicLabel,
        providerId: usage.receipt.providerId,
        runnerReceiptHash: usage.receipt.runnerReceipt?.canonicalReceiptHash ?? null,
        runnerSignatureState: usage.receipt.runnerReceipt?.signatureState ?? null,
        runnerId: usage.receipt.runnerReceipt?.runnerId ?? null,
        latencyMs: usage.receipt.latencyMs,
        dailyBudgetUsd: budgetCheck.dailyBudgetUsd,
        dailyBudgetRemainingUsd: budgetCheck.remainingUsd,
        estimatedProviderCostUsd: budgetCheck.estimatedCostUsd,
        quotaRemaining: quota.remaining,
        creditReserveId: reservation.reserveEntryId,
        creditsReserved: reservation.credits,
        creditsReleased: Math.max(0, reservation.credits - usage.receipt.creditsSpent),
        creditsSpent: usage.receipt.creditsSpent,
        creditsRemaining: usage.creditsRemaining,
        userChargeUsd: usage.receipt.userChargeUsd,
        providerCostUsd: usage.receipt.providerCostUsd,
        grossMarginUsd: usage.receipt.grossMarginUsd
      }
    }
  };
}

function budgetExceededError(check: Extract<RouteBudgetCheck, { ok: false }>) {
  return jsonError(429, "daily_route_budget_exceeded", "budget_error", {
    route: check.route,
    dailyBudgetUsd: check.dailyBudgetUsd,
    spentUsd: check.spentUsd,
    estimatedProviderCostUsd: check.estimatedCostUsd,
    remainingUsd: check.remainingUsd
  });
}

async function releaseReservationAndReturn(
  context: FishChatGatewayContext,
  reservation: CreditReservation,
  result: FishChatGatewayError,
  reason: string
) {
  await releaseFishCreditReservation({
    ledger: context.ledger,
    account: context.account,
    reservation,
    reason
  });
  return result;
}

async function runExternalFallback(input: ChatCompletionInput, promptTokens: number) {
  try {
    const external = await runExternalChat(input, {
      promptTokens,
      completionTokens: estimateTokens("")
    });
    return {
      ok: true as const,
      content: external.content,
      responseModel: external.model,
      promptTokens: external.promptTokens ?? promptTokens,
      completionTokens: external.completionTokens ?? estimateTokens(external.content),
      providerCostUsd: external.providerCostUsd,
      providerId: external.providerId,
      runnerReceipt: null
    };
  } catch (error) {
    const message = error instanceof ExternalChatError ? error.message : "external_chat_backend_error";
    return jsonError(message === "external_chat_not_configured" ? 503 : error instanceof ExternalChatError ? error.status : 502, message, "external_backend_error");
  }
}

function canUseExternalFallback(routerConfig: FishRouterConfig, context: FishChatGatewayContext) {
  if (!context.allowExternalFallback) {
    return false;
  }
  const plan = getFishPlan(context.account.planId);
  return routerConfig.routes["external-fallback"].configured && (plan.externalFallbackAllowed || routerConfig.guardrails.externalFallbackFreeAllowed);
}

function routeNotConfiguredMessage(route: FishChatRouteId) {
  if (route === "ocean-demo-vllm") {
    return "ocean_demo_vllm_not_configured";
  }
  if (route === "external-fallback") {
    return "external_fallback_not_configured";
  }
  return "mock_route_not_configured";
}

function jsonError(status: number, message: string, type: string, extra: Record<string, unknown> = {}): FishChatGatewayError {
  return {
    ok: false,
    status,
    body: {
      error: {
        message,
        type,
        ...extra
      }
    }
  };
}
