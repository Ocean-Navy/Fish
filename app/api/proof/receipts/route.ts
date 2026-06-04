import { NextResponse } from "next/server";
import { listProviderJobReceiptLedger, parseReceiptLedgerQuery } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = parseReceiptLedgerQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_receipt_query",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await listProviderJobReceiptLedger(parsed.data));
}
