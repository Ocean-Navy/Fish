import { NextResponse } from "next/server";
import { readJsonRequestBody } from "@/lib/requestBody";
import { createWalletIntent, parseWalletIntentRequest, summarizeWalletIntents } from "@/lib/walletIntents";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await summarizeWalletIntents();
  return NextResponse.json({
    object: "list",
    dataState: summary.dataState,
    totals: summary.totals,
    data: summary.intents,
    warnings: summary.warnings
  });
}

export async function POST(request: Request) {
  const body = await readJsonRequestBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: { message: body.error, type: "invalid_request_error", maxBytes: body.maxBytes } }, { status: body.status });
  }

  const parsed = parseWalletIntentRequest(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_wallet_intent_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await createWalletIntent(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.error, type: "rate_limit_error", limit: result.limit } }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      intent: result.intent,
      notice: "Wallet intent recorded. Credits are not issued until OCEAN lock verification is available."
    },
    { status: 201 }
  );
}
