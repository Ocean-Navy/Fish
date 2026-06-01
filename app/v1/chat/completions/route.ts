import { NextResponse } from "next/server";
import {
  authenticateRequest,
  buildMockCompletion,
  estimateTokens,
  getFishPlan,
  parseChatCompletion,
  recordChatUsage
} from "@/lib/fishLedger";
import { ExternalChatError, runExternalChat } from "@/lib/externalChat";
import { spendDailyQuota } from "@/lib/fishQuota";
import { getActiveFishRoute, getFishRouterConfig, type FishChatRouteId, type FishCostState } from "@/lib/fishRouter";
import { VllmChatError, runVllmChat } from "@/lib/vllmChat";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const parsed = parseChatCompletion(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_chat_completion_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const input = parsed.data;
  if (input.stream) {
    return NextResponse.json(
      {
        error: {
          message: "streaming_is_not_enabled_in_the_v1_prototype",
          type: "unsupported_feature"
        }
      },
      { status: 400 }
    );
  }

  const promptText = input.messages.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n");
  const routerConfig = getFishRouterConfig();
  const activeRoute = getActiveFishRoute(routerConfig);
  if (routerConfig.killSwitch || routerConfig.paused) {
    return NextResponse.json(
      {
        error: {
          message: routerConfig.killSwitch ? "fish_router_disabled" : "fish_router_paused",
          type: "router_unavailable",
          route: activeRoute.id
        }
      },
      { status: 503 }
    );
  }

  let content = "";
  let responseModel = input.model;
  let promptTokens = estimateTokens(promptText);
  let completionTokens = 0;
  let providerCostUsd = 0;
  let route: FishChatRouteId = activeRoute.id;
  let costState: FishCostState = activeRoute.costState;
  let providerId: string | null = activeRoute.providerId;
  const requestedMaxOutputTokens = input.max_tokens ?? routerConfig.guardrails.maxOutputTokens;

  if (!activeRoute.configured) {
    return NextResponse.json(
      {
        error: {
          message: routeNotConfiguredMessage(activeRoute.id),
          type: "routing_policy_error",
          route
        }
      },
      { status: 503 }
    );
  }

  if (promptTokens > routerConfig.guardrails.maxInputTokens) {
    return NextResponse.json(
      {
        error: {
          message: "max_input_tokens_exceeded",
          type: "guardrail_error",
          limit: routerConfig.guardrails.maxInputTokens,
          estimated: promptTokens
        }
      },
      { status: 400 }
    );
  }

  if (requestedMaxOutputTokens > routerConfig.guardrails.maxOutputTokens) {
    return NextResponse.json(
      {
        error: {
          message: "max_output_tokens_exceeded",
          type: "guardrail_error",
          limit: routerConfig.guardrails.maxOutputTokens,
          requested: requestedMaxOutputTokens
        }
      },
      { status: 400 }
    );
  }

  if (route === "external-fallback") {
    const plan = getFishPlan(auth.account.planId);
    if (!plan.externalFallbackAllowed && !routerConfig.guardrails.externalFallbackFreeAllowed) {
      return NextResponse.json(
        {
          error: {
            message: "external_fallback_not_allowed_for_plan",
            type: "routing_policy_error",
            route
          }
        },
        { status: 403 }
      );
    }
  }

  const estimatedMaxCredits = Math.max(1, Math.ceil((promptTokens + requestedMaxOutputTokens) / 1000));
  if (auth.account.creditBalance < estimatedMaxCredits) {
    return NextResponse.json(
      {
        error: {
          message: "insufficient_fish_credits",
          type: "billing_error",
          needed: estimatedMaxCredits,
          available: auth.account.creditBalance
        }
      },
      { status: 402 }
    );
  }

  const quota = await spendDailyQuota(`key:${auth.account.id}`, route, routerConfig.guardrails.dailyKeyedQuota);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: {
          message: quota.error,
          type: "quota_error",
          limit: quota.limit,
          used: quota.used,
          remaining: quota.remaining
        }
      },
      { status: quota.status }
    );
  }

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
    } catch (error) {
      const message = error instanceof VllmChatError ? error.message : "ocean_demo_vllm_backend_error";
      return NextResponse.json(
        {
          error: {
            message,
            type: "warm_inference_backend_error",
            route
          }
        },
        { status: error instanceof VllmChatError ? error.status : 502 }
      );
    }
  } else if (route === "external-fallback") {
    try {
      const external = await runExternalChat(routeInput, {
        promptTokens,
        completionTokens: estimateTokens("")
      });
      content = external.content;
      responseModel = external.model;
      promptTokens = external.promptTokens ?? promptTokens;
      completionTokens = external.completionTokens ?? estimateTokens(content);
      providerCostUsd = external.providerCostUsd;
      providerId = external.providerId;
      costState = "fallback_verified";
    } catch (error) {
      const message = error instanceof ExternalChatError ? error.message : "external_chat_backend_error";
      return NextResponse.json(
        {
          error: {
            message,
            type: "external_backend_error"
          }
        },
        { status: message === "external_chat_not_configured" ? 503 : 502 }
      );
    }
  } else {
    content = buildMockCompletion(routeInput);
    completionTokens = estimateTokens(content);
  }
  const latencyMs = Date.now() - startedAt;

  const usage = await recordChatUsage({
    ledger: auth.ledger,
    account: auth.account,
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
    providerId
  });

  if (!usage.ok) {
    return NextResponse.json(
      {
        error: {
          message: usage.error,
          type: "billing_error",
          needed: usage.needed,
          available: usage.available
        }
      },
      { status: usage.status }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  return NextResponse.json({
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
      costState: usage.receipt.costState,
      receiptId: usage.receipt.id,
      status: usage.receipt.status,
      routeLabel: activeRoute.publicLabel,
      providerId: usage.receipt.providerId,
      latencyMs: usage.receipt.latencyMs,
      quotaRemaining: quota.remaining,
      creditsSpent: usage.receipt.creditsSpent,
      creditsRemaining: usage.creditsRemaining,
      userChargeUsd: usage.receipt.userChargeUsd,
      providerCostUsd: usage.receipt.providerCostUsd,
      grossMarginUsd: usage.receipt.grossMarginUsd
    }
  });
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
