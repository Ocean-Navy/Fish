import { NextResponse } from "next/server";
import { activateFishSubscription, parseSubscriptionActivation, requireAdmin } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const parsed = parseSubscriptionActivation(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_subscription_activation_request",
        details: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const result = await activateFishSubscription(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    object: "subscription_activation",
    idempotent: result.idempotent,
    plan: result.plan,
    account: result.account,
    entry: result.entry,
    creditsRemaining: result.creditsRemaining
  });
}
