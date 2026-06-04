import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { exportPayoutBatchCsv } from "@/lib/providerPayouts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const { batchId } = await params;
  const csv = await exportPayoutBatchCsv(batchId);
  if (!csv) {
    return NextResponse.json({ error: { message: "payout_batch_not_found", type: "not_found_error" } }, { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fish-payout-batch-${batchId}.csv"`
    }
  });
}
