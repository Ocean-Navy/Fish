import { NextResponse } from "next/server";
import {
  authenticateRequest,
  buildMockCompletion,
  estimateTokens,
  parseChatCompletion,
  recordChatUsage
} from "@/lib/fishLedger";
import { ExternalChatError, getExternalChatConfig, runExternalChat } from "@/lib/externalChat";

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
  let content = "";
  let responseModel = input.model;
  let promptTokens = estimateTokens(promptText);
  let completionTokens = 0;
  let providerCostUsd = 0;
  let route: "mock" | "external-fallback" = "mock";
  let costState: "prototype_estimate" | "fallback_verified" = "prototype_estimate";
  let providerId: string | null = null;

  const externalConfig = getExternalChatConfig();
  if (externalConfig.backend === "external") {
    const estimatedMaxCredits = Math.max(1, Math.ceil((promptTokens + (input.max_tokens ?? 1024)) / 1000));
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

    try {
      const external = await runExternalChat(input, {
        promptTokens,
        completionTokens: estimateTokens("")
      });
      content = external.content;
      responseModel = external.model;
      promptTokens = external.promptTokens ?? promptTokens;
      completionTokens = external.completionTokens ?? estimateTokens(content);
      providerCostUsd = external.providerCostUsd;
      providerId = external.providerId;
      route = "external-fallback";
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
    content = buildMockCompletion(input);
    completionTokens = estimateTokens(content);
  }

  const usage = await recordChatUsage({
    ledger: auth.ledger,
    account: auth.account,
    input,
    promptTokens,
    completionTokens,
    content,
    route,
    costState,
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
      creditsSpent: usage.receipt.creditsSpent,
      creditsRemaining: usage.creditsRemaining,
      userChargeUsd: usage.receipt.userChargeUsd,
      providerCostUsd: usage.receipt.providerCostUsd,
      grossMarginUsd: usage.receipt.grossMarginUsd
    }
  });
}
