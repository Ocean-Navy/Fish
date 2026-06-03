import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/fishPayments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleStripeWebhook(rawBody, request.headers.get("stripe-signature"));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    received: true,
    ignored: "ignored" in result ? result.ignored : false,
    eventType: "eventType" in result ? result.eventType : "checkout.session.completed",
    idempotent: "idempotent" in result ? result.idempotent : false,
    payment: "payment" in result ? result.payment : undefined
  });
}
