import { NextResponse } from "next/server";
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
    allowExternalFallback: true
  });

  if (wantsStream && result.ok) {
    return streamChatCompletion(result.body);
  }

  return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
}

function streamChatCompletion(body: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const id = readString(body, "id") ?? `chatcmpl_${Date.now()}`;
  const created = readNumber(body, "created") ?? Math.floor(Date.now() / 1000);
  const model = readString(body, "model") ?? "fish-demo-chat";
  const content = readAssistantContent(body);
  const fish = body.fish;
  const usage = body.usage;

  const chunks = [
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      fish
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }]
    },
    {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage,
      fish
    }
  ];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}

function readAssistantContent(body: Record<string, unknown>) {
  const choices = body.choices;
  if (!Array.isArray(choices)) {
    return "";
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return "";
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function readString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
