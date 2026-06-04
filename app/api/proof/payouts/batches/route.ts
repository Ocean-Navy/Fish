import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { createPayoutBatch, listPayoutBatches, parsePayoutBatchRequest } from "@/lib/providerPayouts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }
  const batches = await listPayoutBatches();
  return NextResponse.json({
    object: "list",
    dataState: batches.length ? "live" : "sample",
    data: batches
  });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parsePayoutBatchRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_payout_batch_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, batch: await createPayoutBatch(parsed.data) }, { status: 201 });
}
