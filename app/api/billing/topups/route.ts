import { NextResponse } from "next/server";
import { addFishCredits, parseCreditTopup, requireAdmin } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCreditTopup(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_credit_topup_request",
        details: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const result = await addFishCredits(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    object: "credit_topup",
    idempotent: result.idempotent,
    account: result.account,
    entry: result.entry,
    creditsRemaining: result.creditsRemaining
  });
}
