import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { createPayoutEvent, parsePayoutEventRequest, parsePayoutQuery, summarizePayouts } from "@/lib/providerPayouts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parsePayoutQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_payout_query",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await summarizePayouts(parsed.data));
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
