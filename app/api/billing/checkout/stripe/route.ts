import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/fishLedger";
import { createStripeCheckoutPayment, parseStripeCheckoutRequest } from "@/lib/fishPayments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const parsed = parseStripeCheckoutRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_stripe_checkout_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await createStripeCheckoutPayment(auth.account, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.error, type: "billing_error" } }, { status: result.status });
  }

  return NextResponse.json({
    object: "fish_checkout",
    idempotent: result.idempotent,
    payment: result.payment,
    checkoutUrl: result.payment.checkoutUrl
  });
}
