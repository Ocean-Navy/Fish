import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { createPayoutEvent, parsePayoutEventRequest, summarizePayouts } from "@/lib/providerPayouts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizePayouts());
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parsePayoutEventRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_payout_event_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, event: await createPayoutEvent(parsed.data) }, { status: 201 });
}
