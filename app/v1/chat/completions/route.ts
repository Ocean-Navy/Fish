import { NextResponse } from "next/server";
import { streamChatCompletion } from "@/lib/chatCompletionStream";
import { authenticateRequest, parseChatCompletion } from "@/lib/fishLedger";
import { getFishRouterConfig } from "@/lib/fishRouter";
import { runFishChatGateway } from "@/lib/fishChatGateway";

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

  const routerConfig = getFishRouterConfig();
  const wantsStream = parsed.data.stream === true;
  const result = await runFishChatGateway(wantsStream ? { ...parsed.data, stream: false } : parsed.data, {
    ledger: auth.ledger,
    account: auth.account,
    principalId: `key:${auth.account.id}`,
    dailyQuotaLimit: routerConfig.guardrails.dailyKeyedQuota,
    allowExternalFallback: true,
    authenticatedApiKey: true
  });

  if (wantsStream && result.ok) {
    return streamChatCompletion(result.body);
  }

  return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
}
