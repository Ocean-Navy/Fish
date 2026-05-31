import { NextResponse } from "next/server";
import {
  authenticateRequest,
  buildMockCompletion,
  estimateTokens,
  parseChatCompletion,
  recordChatUsage
} from "@/lib/fishLedger";

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

  const content = buildMockCompletion(input);
  const promptText = input.messages.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n");
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(content);
  const usage = await recordChatUsage({
    ledger: auth.ledger,
    account: auth.account,
    input,
    promptTokens,
    completionTokens,
    content
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
    model: input.model,
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
