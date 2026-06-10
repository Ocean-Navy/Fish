import { createHash } from "node:crypto";
import {
  buildMockCompletion,
  checkFishMonthlyRequestLimit,
  checkFishModelAccess,
  estimateTokens,
  getActiveFishPlan,
  recordChatUsage,
  recordFailedChatUsage,
  releaseFishCreditReservation,
  reserveFishCredits,
  type Account,
  type ChatCompletionInput,
  type CreditReservation,
  type Ledger,
  type RunnerReceiptSummary
} from "@/lib/fishLedger";
import { ExternalChatError, runExternalChat } from "@/lib/externalChat";
import { getFishChatTimeoutMs } from "@/lib/fishChatTimeout";
import { tryAcquireFishConcurrencySlot } from "@/lib/fishConcurrency";
import { getFishBatchFeatureConfig, getFishFeaturePolicy, type FishBatchTaskType, type FishFeatureId } from "@/lib/fishFeaturePolicy";
import { buildFishKnowledgeContext } from "@/lib/fishKnowledge";
import { releaseRouteDailyBudgetReservation, reserveRouteDailyBudget, type RouteBudgetCheck, type RouteBudgetReservation } from "@/lib/fishBudget";
import { spendDailyQuota } from "@/lib/fishQuota";
import { readFishPrivacyPreference, resolveFishPrivacy, type FishUsagePrivacy } from "@/lib/fishPrivacy";
import { recordFishRouteFailure, recordFishRouteSuccess } from "@/lib/fishRouteHealth";
import { spendFishMinuteRateLimit } from "@/lib/fishRateLimit";
import { runOceanBatchJob } from "@/lib/oceanBatch";
import { OceanProviderChatError, runSelectedOceanProviderChat } from "@/lib/oceanProviderChat";
import { getActiveFishRoute, getFishRouterConfig, type FishChatRouteId, type FishCostState, type FishRouterConfig } from "@/lib/fishRouter";
import { VllmChatError, runVllmChat } from "@/lib/vllmChat";

export type FishChatGatewayContext = {
  ledger: Ledger;
  account: Account;
  principalId: string;
  dailyQuotaLimit: number;
  allowExternalFallback: boolean;
  authenticatedApiKey: boolean;
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

type FailedUsageReceiptInput = {
  input: ChatCompletionInput;
  model?: string;
  promptTokens: number;
  route: FishChatRouteId;
  costState: FishCostState;
  latencyMs: number;
  providerId: string | null;
  requestedRoute: FishChatRouteId;
  fallbackFrom: FishChatRouteId | null;
  fallbackReason: string | null;
  runnerReceipt: RunnerReceiptSummary | null;
  errorCode: string;
  privacy: FishUsagePrivacy;
};

export async function runFishChatGateway(input: ChatCompletionInput, context: FishChatGatewayContext): Promise<FishChatGatewayResult> {
  if (input.stream) {
    return jsonError(400, "streaming_is_not_enabled_in_the_v1_prototype", "unsupported_feature");
  }

  const routerConfig = getFishRouterConfig();
  const featurePolicy = getFishFeaturePolicy(input.metadata, routerConfig, input.model);
  const batchFeature = getFishBatchFeatureConfig(featurePolicy.id);
  const sendBatchPrivatePayload = Boolean(batchFeature && shouldSendBatchPrivatePayload(featurePolicy.id));
  const privacyPreference = readFishPrivacyPreference(input.metadata);
  const plan = getActiveFishPlan(context.account);
  const modelAccess = checkFishModelAccess(input.model, context.account);
  const originalPromptText = messagesToText(input);
  const originalUserPromptText = messagesToUserText(input);
  const privateOrderText = readPrivateOrderText(input.metadata) ?? originalUserPromptText;
  let knowledge: ReturnType<typeof buildFishKnowledgeContext> | null = null;
  let effectiveInput = input;
  let promptText = originalPromptText;
  let promptTokens = estimateTokens(promptText);
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

  if (!privacyPreference.ok) {
    return jsonError(400, privacyPreference.error, "privacy_error", {
      requestedPrivacyMode: privacyPreference.requestedPrivacyMode
    });
  }

  let content = "";
  let responseModel = input.model;
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

  if (promptTokens > featurePolicy.maxInputTokens) {
    return maxInputTokensExceededError(featurePolicy.id, featurePolicy.maxInputTokens, promptTokens);
  }

  if (featurePolicy.id === "ocean") {
    knowledge = buildFishKnowledgeContext(originalPromptText);
    effectiveInput = withFishKnowledgeContext(input, knowledge.context);
    promptText = messagesToText(effectiveInput);
    promptTokens = estimateTokens(promptText);
    if (promptTokens > featurePolicy.maxInputTokens) {
      return maxInputTokensExceededError(featurePolicy.id, featurePolicy.maxInputTokens, promptTokens);
    }
  }

  if (requestedMaxOutputTokens > featurePolicy.maxOutputTokens) {
    return jsonError(400, "max_output_tokens_exceeded", "guardrail_error", {
      feature: featurePolicy.id,
      limit: featurePolicy.maxOutputTokens,
      requested: requestedMaxOutputTokens
    });
  }

  if (batchFeature && !context.authenticatedApiKey) {
    return jsonError(401, "missing_bearer_token", "authentication_error", {
      feature: featurePolicy.id,
      route: "ocean-batch"
    });
  }

  if (batchFeature && !canUseOceanProviderRoute(context)) {
    return jsonError(403, "ocean_provider_not_allowed_for_plan", "routing_policy_error", {
      feature: featurePolicy.id,
      route: "ocean-batch"
    });
  }

  const batchPrivacy =
    batchFeature
      ? resolveFishPrivacy({
          route: sendBatchPrivatePayload ? "ocean-batch-private" : "ocean-batch",
          requestedPrivacyMode: privacyPreference.requestedPrivacyMode,
          allowPrivacyDowngrade: privacyPreference.allowPrivacyDowngrade
        })
      : null;
  if (batchPrivacy && !batchPrivacy.ok) {
    return privacyModeError(batchPrivacy);
  }

  const rateLimit = spendFishMinuteRateLimit(context.principalId, plan.rateLimitPerMinute);
  if (!rateLimit.ok) {
    return jsonError(429, "rate_limit_exceeded", "rate_limit_error", {
      planId: plan.planId,
      limit: rateLimit.limit,
      used: rateLimit.used,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt
    });
  }

  const monthlyRequests = await checkFishMonthlyRequestLimit(context.account, plan.monthlyRequestLimit);
  if (!monthlyRequests.ok) {
    return jsonError(monthlyRequests.status, monthlyRequests.error, "quota_error", {
      planId: plan.planId,
      limit: monthlyRequests.limit,
      used: monthlyRequests.used,
      remaining: monthlyRequests.remaining,
      resetAt: monthlyRequests.resetAt
    });
  }

  if (batchFeature) {
    if (!batchPrivacy?.ok) {
      return jsonError(500, "batch_privacy_state_missing", "privacy_error");
    }

    const batchRoute: FishChatRouteId = "ocean-provider";
    const concurrencySlot = tryAcquireFishConcurrencySlot(batchRoute, routerConfig.guardrails.maxConcurrentRequests);
    if (!concurrencySlot.ok) {
      return jsonError(429, "max_concurrent_requests_exceeded", "concurrency_error", {
        route: batchRoute,
        activeRequests: concurrencySlot.activeRequests,
        activeForRoute: concurrencySlot.activeForRoute,
        limit: concurrencySlot.limit
      });
    }

    try {
      return await runBatchChatGateway({
        input,
        context,
        promptText,
        privatePayloadText: privateOrderText,
        promptTokens,
        maxOutputTokens: requestedMaxOutputTokens,
        featureLabel: featurePolicy.label,
        sendPrivatePayload: sendBatchPrivatePayload,
        batchFeature,
        monthlyRequests,
        rateLimit,
        privacy: batchPrivacy.privacy
      });
    } finally {
      concurrencySlot.release();
    }
  }

  if (activeRoute.id === "ocean-provider" && !canUseOceanProviderRoute(context)) {
    return jsonError(403, "ocean_provider_not_allowed_for_plan", "routing_policy_error", { route });
  }

  if (!activeRoute.configured && (activeRoute.id === "ocean-demo-vllm" || activeRoute.id === "ocean-provider") && canUseExternalFallback(routerConfig, context)) {
    route = "external-fallback";
    fallbackFrom = activeRoute.id;
    fallbackReason = "primary_not_configured";
    costState = "fallback_verified";
    providerId = routerConfig.routes["external-fallback"].providerId;
  } else if (!activeRoute.configured) {
    return jsonError(503, routeNotConfiguredMessage(activeRoute.id), "routing_policy_error", { route });
  }

  if (route === "external-fallback" && !canUseExternalFallback(routerConfig, context)) {
    return jsonError(403, "external_fallback_not_allowed_for_plan", "routing_policy_error", { route });
  }

  const privacyDecision = resolveFishPrivacy({
    route,
    requestedPrivacyMode: privacyPreference.requestedPrivacyMode,
    allowPrivacyDowngrade: privacyPreference.allowPrivacyDowngrade
  });
  if (!privacyDecision.ok) {
    return privacyModeError(privacyDecision);
  }
  let privacy = privacyDecision.privacy;

  const concurrencySlot = tryAcquireFishConcurrencySlot(route, routerConfig.guardrails.maxConcurrentRequests);
  if (!concurrencySlot.ok) {
    return jsonError(429, "max_concurrent_requests_exceeded", "concurrency_error", {
      route,
      activeRequests: concurrencySlot.activeRequests,
      activeForRoute: concurrencySlot.activeForRoute,
      limit: concurrencySlot.limit
    });
  }

  let routeBudgetReservation: RouteBudgetReservation | null = null;

  try {

  const estimatedMaxCredits = Math.max(1, Math.ceil((promptTokens + requestedMaxOutputTokens) / 1000));
  if (context.account.creditBalance < estimatedMaxCredits) {
    return jsonError(402, "insufficient_fish_credits", "billing_error", {
      needed: estimatedMaxCredits,
      available: context.account.creditBalance
    });
  }

  let budgetCheck = await reserveRouteDailyBudget({
    route,
    promptTokens,
    maxOutputTokens: requestedMaxOutputTokens,
    routerConfig
  });
  if (!budgetCheck.ok) {
    return budgetExceededError(budgetCheck);
  }
  routeBudgetReservation = budgetCheck;

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

  const routeInput = { ...effectiveInput, max_tokens: requestedMaxOutputTokens };
  const startedAt = Date.now();
  if (route === "ocean-demo-vllm") {
    try {
      const warm = await runVllmChat(
        routeInput,
        {
          promptTokens,
          completionTokens: estimateTokens("")
        },
        {
          routeId: route,
          idempotencyKey: reservation.requestId,
          maxBudgetUsd: estimateRouteMaxCostUsd(route, promptTokens, requestedMaxOutputTokens, routerConfig),
          timeoutMs: getFishChatTimeoutMs()
        }
      );
      content = warm.content;
      responseModel = warm.model;
      promptTokens = warm.promptTokens ?? promptTokens;
      completionTokens = warm.completionTokens ?? estimateTokens(content);
      providerCostUsd = warm.providerCostUsd;
      providerId = warm.providerId;
      runnerReceipt = warm.runnerReceipt;
      recordFishRouteSuccess("ocean-demo-vllm");
    } catch (error) {
      recordFishRouteFailure("ocean-demo-vllm", error instanceof VllmChatError ? error.message : "ocean_demo_vllm_backend_error");
      if (!canUseExternalFallback(routerConfig, context)) {
        const message = error instanceof VllmChatError ? error.message : "ocean_demo_vllm_backend_error";
        const result = jsonError(error instanceof VllmChatError ? error.status : 502, message, "warm_inference_backend_error", { route });
        return releaseReservationAndReturn(context, reservation, result, "credit_reserve_release_backend_error", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route,
          costState,
          latencyMs: Date.now() - startedAt,
          providerId,
          requestedRoute,
          fallbackFrom,
          fallbackReason,
          runnerReceipt,
          errorCode: message,
          privacy
        });
      }

      await releaseRouteDailyBudgetReservation(routeBudgetReservation);
      routeBudgetReservation = null;

      const fallbackBudgetCheck = await reserveRouteDailyBudget({
        route: "external-fallback",
        promptTokens,
        maxOutputTokens: requestedMaxOutputTokens,
        routerConfig
      });
      if (!fallbackBudgetCheck.ok) {
        const result = budgetExceededError(fallbackBudgetCheck);
        return releaseReservationAndReturn(context, reservation, result, "credit_reserve_release_fallback_budget_error", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route,
          costState,
          latencyMs: Date.now() - startedAt,
          providerId,
          requestedRoute,
          fallbackFrom,
          fallbackReason,
          runnerReceipt,
          errorCode: "primary_backend_error_fallback_budget_exceeded",
          privacy
        });
      }
      budgetCheck = fallbackBudgetCheck;
      routeBudgetReservation = fallbackBudgetCheck;

      const fallbackPrivacyDecision = resolveFishPrivacy({
        route: "external-fallback",
        requestedPrivacyMode: privacyPreference.requestedPrivacyMode,
        allowPrivacyDowngrade: privacyPreference.allowPrivacyDowngrade
      });
      if (!fallbackPrivacyDecision.ok) {
        return releaseReservationAndReturn(context, reservation, privacyModeError(fallbackPrivacyDecision), "credit_reserve_release_privacy_downgrade_blocked", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route,
          costState,
          latencyMs: Date.now() - startedAt,
          providerId,
          requestedRoute,
          fallbackFrom,
          fallbackReason,
          runnerReceipt,
          errorCode: "primary_backend_error_privacy_downgrade_blocked",
          privacy
        });
      }

      const fallback = await runExternalFallback(routeInput, promptTokens);
      if (!fallback.ok) {
        return releaseReservationAndReturn(context, reservation, fallback, "credit_reserve_release_fallback_error", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route: "external-fallback",
          costState: "fallback_verified",
          latencyMs: Date.now() - startedAt,
          providerId: routerConfig.routes["external-fallback"].providerId,
          requestedRoute,
          fallbackFrom: "ocean-demo-vllm",
          fallbackReason: "primary_backend_error",
          runnerReceipt,
          errorCode: readErrorMessage(fallback),
          privacy: fallbackPrivacyDecision.privacy
        });
      }
      ({ content, responseModel, promptTokens, completionTokens, providerCostUsd, providerId, runnerReceipt } = fallback);
      fallbackFrom = "ocean-demo-vllm";
      fallbackReason = "primary_backend_error";
      route = "external-fallback";
      costState = "fallback_verified";
      privacy = fallbackPrivacyDecision.privacy;
    }
  } else if (route === "ocean-provider") {
    try {
      const provider = await runSelectedOceanProviderChat(
        routeInput,
        {
          promptTokens,
          completionTokens: estimateTokens("")
        },
        {
          routeId: route,
          idempotencyKey: reservation.requestId,
          maxBudgetUsd: estimateRouteMaxCostUsd(route, promptTokens, requestedMaxOutputTokens, routerConfig),
          timeoutMs: getFishChatTimeoutMs()
        }
      );
      content = provider.content;
      responseModel = provider.model;
      promptTokens = provider.promptTokens ?? promptTokens;
      completionTokens = provider.completionTokens ?? estimateTokens(content);
      providerCostUsd = provider.providerCostUsd;
      providerId = provider.providerId;
      runnerReceipt = provider.runnerReceipt;
      recordFishRouteSuccess("ocean-provider");
    } catch (error) {
      recordFishRouteFailure("ocean-provider", error instanceof OceanProviderChatError ? error.message : "ocean_provider_backend_error");
      if (!canUseExternalFallback(routerConfig, context)) {
        const message = error instanceof OceanProviderChatError ? error.message : "ocean_provider_backend_error";
        const result = jsonError(error instanceof OceanProviderChatError ? error.status : 502, message, "ocean_provider_backend_error", { route });
        return releaseReservationAndReturn(context, reservation, result, "credit_reserve_release_provider_error", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route,
          costState,
          latencyMs: Date.now() - startedAt,
          providerId,
          requestedRoute,
          fallbackFrom,
          fallbackReason,
          runnerReceipt,
          errorCode: message,
          privacy
        });
      }

      await releaseRouteDailyBudgetReservation(routeBudgetReservation);
      routeBudgetReservation = null;

      const fallbackBudgetCheck = await reserveRouteDailyBudget({
        route: "external-fallback",
        promptTokens,
        maxOutputTokens: requestedMaxOutputTokens,
        routerConfig
      });
      if (!fallbackBudgetCheck.ok) {
        const result = budgetExceededError(fallbackBudgetCheck);
        return releaseReservationAndReturn(context, reservation, result, "credit_reserve_release_fallback_budget_error", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route,
          costState,
          latencyMs: Date.now() - startedAt,
          providerId,
          requestedRoute,
          fallbackFrom,
          fallbackReason,
          runnerReceipt,
          errorCode: "primary_backend_error_fallback_budget_exceeded",
          privacy
        });
      }
      budgetCheck = fallbackBudgetCheck;
      routeBudgetReservation = fallbackBudgetCheck;

      const fallbackPrivacyDecision = resolveFishPrivacy({
        route: "external-fallback",
        requestedPrivacyMode: privacyPreference.requestedPrivacyMode,
        allowPrivacyDowngrade: privacyPreference.allowPrivacyDowngrade
      });
      if (!fallbackPrivacyDecision.ok) {
        return releaseReservationAndReturn(context, reservation, privacyModeError(fallbackPrivacyDecision), "credit_reserve_release_privacy_downgrade_blocked", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route,
          costState,
          latencyMs: Date.now() - startedAt,
          providerId,
          requestedRoute,
          fallbackFrom,
          fallbackReason,
          runnerReceipt,
          errorCode: "primary_backend_error_privacy_downgrade_blocked",
          privacy
        });
      }

      const fallback = await runExternalFallback(routeInput, promptTokens);
      if (!fallback.ok) {
        return releaseReservationAndReturn(context, reservation, fallback, "credit_reserve_release_fallback_error", {
          input: effectiveInput,
          model: responseModel,
          promptTokens,
          route: "external-fallback",
          costState: "fallback_verified",
          latencyMs: Date.now() - startedAt,
          providerId: routerConfig.routes["external-fallback"].providerId,
          requestedRoute,
          fallbackFrom: "ocean-provider",
          fallbackReason: "primary_backend_error",
          runnerReceipt,
          errorCode: readErrorMessage(fallback),
          privacy: fallbackPrivacyDecision.privacy
        });
      }
      ({ content, responseModel, promptTokens, completionTokens, providerCostUsd, providerId, runnerReceipt } = fallback);
      fallbackFrom = "ocean-provider";
      fallbackReason = "primary_backend_error";
      route = "external-fallback";
      costState = "fallback_verified";
      privacy = fallbackPrivacyDecision.privacy;
    }
  } else if (route === "external-fallback") {
    const fallback = await runExternalFallback(routeInput, promptTokens);
    if (!fallback.ok) {
      return releaseReservationAndReturn(context, reservation, fallback, "credit_reserve_release_fallback_error", {
        input: effectiveInput,
        model: responseModel,
        promptTokens,
        route,
        costState,
        latencyMs: Date.now() - startedAt,
        providerId,
        requestedRoute,
        fallbackFrom,
        fallbackReason,
        runnerReceipt,
        errorCode: readErrorMessage(fallback),
        privacy
      });
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
    input: effectiveInput,
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
    reservation,
    privacy
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
        monthlyRequestRemaining: Math.max(0, monthlyRequests.remaining - 1),
        monthlyRequestResetAt: monthlyRequests.resetAt,
        rateLimitRemaining: rateLimit.remaining,
        rateLimitResetAt: rateLimit.resetAt,
        creditReserveId: reservation.reserveEntryId,
        creditsReserved: reservation.credits,
        creditsReleased: Math.max(0, reservation.credits - usage.receipt.creditsSpent),
        creditsSpent: usage.receipt.creditsSpent,
        creditsRemaining: usage.creditsRemaining,
        userChargeUsd: usage.receipt.userChargeUsd,
        providerCostUsd: usage.receipt.providerCostUsd,
        grossMarginUsd: usage.receipt.grossMarginUsd,
        knowledgeSources: knowledge?.sources,
        privacy: usage.receipt.privacy,
        storesPromptOutputText: false,
        storesOutputText: false
      }
    }
  };
  } finally {
    await releaseRouteDailyBudgetReservation(routeBudgetReservation);
    concurrencySlot.release();
  }
}

function maxInputTokensExceededError(feature: FishFeatureId, limit: number, estimated: number) {
  return jsonError(400, "max_input_tokens_exceeded", "guardrail_error", {
    feature,
    limit,
    estimated
  });
}

function messagesToText(input: ChatCompletionInput) {
  return input.messages.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n");
}

function messagesToUserText(input: ChatCompletionInput) {
  return input.messages
    .filter((message) => message.role === "user")
    .map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content)))
    .join("\n");
}

function readPrivateOrderText(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.fish_order_text;
  return typeof value === "string" && value.trim() ? value : null;
}

function withFishKnowledgeContext(input: ChatCompletionInput, context: string): ChatCompletionInput {
  return {
    ...input,
    messages: [
      {
        role: "system",
        content: [
          "Fish/Ocean context pack. Use this as local project context, not as live external data.",
          "Do not claim official Ocean Protocol status, full decentralization, staking yield, unlimited AI, or cryptographic privacy unless the route evidence supports it.",
          context
        ].join("\n\n")
      },
      ...input.messages
    ]
  };
}

function estimateRouteMaxCostUsd(route: FishChatRouteId, promptTokens: number, maxOutputTokens: number, routerConfig: FishRouterConfig) {
  const costUsdPer1kTokens =
    route === "ocean-demo-vllm"
      ? routerConfig.warm.costUsdPer1kTokens
      : route === "ocean-provider"
        ? routerConfig.selectedProvider.costUsdPer1kTokens
        : route === "external-fallback"
          ? routerConfig.external.costUsdPer1kTokens
          : 0;
  return Number((((promptTokens + maxOutputTokens) / 1000) * Math.max(0, costUsdPer1kTokens)).toFixed(6));
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

async function runBatchChatGateway(params: {
  input: ChatCompletionInput;
  context: FishChatGatewayContext;
  promptText: string;
  privatePayloadText: string;
  promptTokens: number;
  maxOutputTokens: number;
  featureLabel: string;
  sendPrivatePayload: boolean;
  batchFeature: {
    featureId: FishFeatureId;
    label: string;
    taskType: FishBatchTaskType;
    defaultMaxRuntimeSeconds: number;
    defaultMaxCostUsd: number;
  };
  monthlyRequests: Extract<Awaited<ReturnType<typeof checkFishMonthlyRequestLimit>>, { ok: true }>;
  rateLimit: Extract<ReturnType<typeof spendFishMinuteRateLimit>, { ok: true }>;
  privacy: FishUsagePrivacy;
}): Promise<FishChatGatewayResult> {
  const inputRef = hashInputRef(params.promptText);
  const privatePayload = params.sendPrivatePayload ? trimBatchPrivatePayload(params.privatePayloadText) : undefined;
  const adapterMode = process.env.FISH_OCEAN_BATCH_ENDPOINT?.trim() && canUseOceanProviderRoute(params.context) ? "ocean_http" : "sample_success";
  const result = await runOceanBatchJob(
    {
      taskType: params.batchFeature.taskType,
      inputRef,
      inputPayload: privatePayload,
      artifactKind: artifactKindForBatchFeature(params.batchFeature.featureId),
      estimatedInputTokens: params.promptTokens,
      maxOutputTokens: params.maxOutputTokens,
      maxRuntimeSeconds: readBatchMaxRuntimeSeconds(params.batchFeature.featureId, params.batchFeature.defaultMaxRuntimeSeconds),
      maxCostUsd: readBatchMaxCostUsd(params.batchFeature.featureId, params.batchFeature.defaultMaxCostUsd),
      adapterMode
    },
    {
      ledger: params.context.ledger,
      account: params.context.account,
      featureId: params.batchFeature.featureId,
      privacy: params.privacy,
      quota: {
        principalId: params.context.principalId,
        dailyQuotaLimit: params.context.dailyQuotaLimit
      }
    }
  );

  if (!result.ok) {
    return jsonError(result.status, result.error, result.status === 402 ? "billing_error" : result.status === 429 ? "quota_or_budget_error" : "ocean_batch_error", {
      needed: "needed" in result ? result.needed : undefined,
      available: "available" in result ? result.available : undefined,
      budget: "budget" in result ? result.budget : undefined,
      quota: "quota" in result ? result.quota : undefined,
      receipt: "receipt" in result ? result.receipt : undefined
    });
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    body: {
      id: `chatcmpl_${result.usageReceipt.id}`,
      object: "chat.completion",
      created: now,
      model: result.receipt.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: batchCompletionText(params.featureLabel, result.receipt, result.artifact)
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: result.receipt.usage.inputTokens,
        completion_tokens: result.receipt.usage.outputTokens,
        total_tokens: result.receipt.usage.totalTokens
      },
      fish: {
        route: result.usageReceipt.route,
        requestedRoute: result.usageReceipt.requestedRoute,
        fallbackFrom: result.usageReceipt.fallbackFrom,
        fallbackReason: result.usageReceipt.fallbackReason,
        feature: result.usageReceipt.feature,
        featureLabel: params.featureLabel,
        costState: result.usageReceipt.costState,
        receiptId: result.usageReceipt.id,
        status: result.usageReceipt.status,
        routeLabel: "Ocean batch",
        providerId: result.usageReceipt.providerId,
        runnerReceiptHash: null,
        runnerSignatureState: null,
        runnerId: null,
        latencyMs: result.usageReceipt.latencyMs,
        dailyBudgetUsd: result.budget.dailyBudgetUsd,
        dailyBudgetRemainingUsd: result.budget.remainingUsd,
        estimatedProviderCostUsd: result.receipt.cost.providerCostUsd,
        quotaRemaining: result.quota?.remaining,
        monthlyRequestRemaining: Math.max(0, params.monthlyRequests.remaining - 1),
        monthlyRequestResetAt: params.monthlyRequests.resetAt,
        rateLimitRemaining: params.rateLimit.remaining,
        rateLimitResetAt: params.rateLimit.resetAt,
        creditsSpent: result.usageReceipt.creditsSpent,
        creditsRemaining: result.creditsRemaining,
        userChargeUsd: result.usageReceipt.userChargeUsd,
        providerCostUsd: result.usageReceipt.providerCostUsd,
        grossMarginUsd: result.usageReceipt.grossMarginUsd,
        privacy: result.usageReceipt.privacy,
        batchReceiptId: result.receipt.receiptId,
        batchJobId: result.receipt.jobId,
        batchSourceState: result.receipt.sourceState,
        batchAdapterMode: result.receipt.adapterMode,
        batchOutputRef: result.receipt.hashes.outputHash,
        inputRef,
        storesPromptOutputText: false,
        storesOutputText: false
      }
    }
  };
}

function privacyModeError(decision: Extract<ReturnType<typeof resolveFishPrivacy>, { ok: false }>) {
  return jsonError(decision.status, decision.error, "privacy_error", {
    requestedPrivacyMode: decision.requestedPrivacyMode,
    acceptedPrivacyMode: decision.acceptedPrivacyMode,
    rawPromptSentTo: decision.rawPromptSentTo,
    allowPrivacyDowngrade: false
  });
}

function batchCompletionText(
  featureLabel: string,
  receipt: { sourceState: string; receiptId: string; jobId: string; hashes: { outputHash: string | null } },
  artifact: { title: string; markdown: string } | null
) {
  if (artifact?.markdown) {
    return artifact.markdown;
  }
  const path =
    receipt.sourceState === "snapshot"
      ? `Your ${featureLabel.toLowerCase()} result is ready.`
      : `Your sample ${featureLabel.toLowerCase()} result is ready.`;
  return `${path}\n\nThe receipt is saved separately.`;
}

function shouldSendBatchPrivatePayload(featureId: FishFeatureId) {
  if (!["docs", "repo", "eval", "data"].includes(featureId)) {
    return false;
  }
  return readBooleanEnv("FISH_OCEAN_BATCH_PRIVATE_PAYLOAD", false);
}

function artifactKindForBatchFeature(featureId: FishFeatureId) {
  if (featureId === "repo") {
    return "repo_map" as const;
  }
  if (featureId === "eval") {
    return "eval_scorecard" as const;
  }
  if (featureId === "data") {
    return "data_card" as const;
  }
  return "summary_card" as const;
}

function trimBatchPrivatePayload(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized.length > 12000 ? normalized.slice(0, 12000) : normalized;
}

function readBooleanEnv(key: string, fallback: boolean) {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(raw) ? true : ["0", "false", "no", "off"].includes(raw) ? false : fallback;
}

function hashInputRef(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readBatchMaxCostUsd(featureId: FishFeatureId, fallback: number) {
  const parsed = Number(process.env[`FISH_${featureId.toUpperCase()}_BATCH_MAX_COST_USD`] ?? fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBatchMaxRuntimeSeconds(featureId: FishFeatureId, fallback: number) {
  const parsed = Number(process.env[`FISH_${featureId.toUpperCase()}_BATCH_MAX_RUNTIME_SECONDS`] ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function releaseReservationAndReturn(
  context: FishChatGatewayContext,
  reservation: CreditReservation,
  result: FishChatGatewayError,
  reason: string,
  failure?: FailedUsageReceiptInput
) {
  await releaseFishCreditReservation({
    ledger: context.ledger,
    account: context.account,
    reservation,
    reason
  });
  if (failure) {
    await recordFailedChatUsage({
      ledger: context.ledger,
      account: context.account,
      ...failure
    });
  }
  return result;
}

function readErrorMessage(result: FishChatGatewayError) {
  const error = result.body.error;
  if (!error || typeof error !== "object") {
    return "fish_backend_error";
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : "fish_backend_error";
}

async function runExternalFallback(input: ChatCompletionInput, promptTokens: number) {
  try {
    const external = await runExternalChat(input, {
      promptTokens,
      completionTokens: estimateTokens("")
    });
    recordFishRouteSuccess("external-fallback");
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
    if (message !== "external_chat_not_configured") {
      recordFishRouteFailure("external-fallback", message);
    }
    return jsonError(message === "external_chat_not_configured" ? 503 : error instanceof ExternalChatError ? error.status : 502, message, "external_backend_error");
  }
}

function canUseExternalFallback(routerConfig: FishRouterConfig, context: FishChatGatewayContext) {
  if (!context.allowExternalFallback) {
    return false;
  }
  const plan = getActiveFishPlan(context.account);
  return routerConfig.routes["external-fallback"].configured && (plan.externalFallbackAllowed || routerConfig.guardrails.externalFallbackFreeAllowed);
}

function canUseOceanProviderRoute(context: FishChatGatewayContext) {
  const plan = getActiveFishPlan(context.account);
  return plan.oceanProviderAllowed;
}

function routeNotConfiguredMessage(route: FishChatRouteId) {
  if (route === "ocean-demo-vllm") {
    return "ocean_demo_vllm_not_configured";
  }
  if (route === "ocean-provider") {
    return "ocean_provider_not_configured";
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
