import { NextResponse } from "next/server";
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
  const parsed = parseWalletIntentRequest(await request.json().catch(() => ({})));
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

  const intent = await createWalletIntent(parsed.data);
  return NextResponse.json(
    {
      ok: true,
      intent,
      notice: "Wallet intent recorded. Credits are not issued until OCEAN lock verification is available."
    },
    { status: 201 }
  );
}
