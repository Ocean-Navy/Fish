import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { exportPayoutEventsCsv } from "@/lib/providerPayouts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  return new NextResponse(await exportPayoutEventsCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="fish-payout-events.csv"'
    }
  });
}
