import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { exportProviderJobReceiptsCsv, exportProviderJobReceiptsJson, parseReceiptLedgerQuery } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const url = new URL(request.url);
  const parsed = parseReceiptLedgerQuery(url.searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_receipt_export_query",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  if (url.searchParams.get("format") === "json") {
    return NextResponse.json(await exportProviderJobReceiptsJson(parsed.data));
  }

  return new NextResponse(await exportProviderJobReceiptsCsv(parsed.data), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="fish-provider-receipts.csv"'
    }
  });
}
