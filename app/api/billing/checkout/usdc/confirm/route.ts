import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/fishLedger";
import { confirmUsdcPayment, parseUsdcConfirmRequest } from "@/lib/fishPayments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const parsed = parseUsdcConfirmRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_usdc_confirmation_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  try {
    const result = await confirmUsdcPayment(auth.account, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: { message: result.error, type: "billing_error" } }, { status: result.status });
    }

    return NextResponse.json({
      object: "fish_usdc_payment_confirmation",
      idempotent: result.idempotent,
      payment: result.payment
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "usdc_confirmation_failed",
          type: "billing_error"
        }
      },
      { status: 502 }
    );
  }
}
