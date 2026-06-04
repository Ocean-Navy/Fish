import { NextResponse } from "next/server";
import { getProviderJobReceiptDetail } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const detail = await getProviderJobReceiptDetail(receiptId);
  if (!detail) {
    return NextResponse.json({ error: { message: "receipt_not_found", type: "not_found_error" } }, { status: 404 });
  }

  return NextResponse.json(detail);
}
