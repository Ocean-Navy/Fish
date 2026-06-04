import { NextResponse } from "next/server";
import { authenticateRequest, summarizeAccount } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const summary = await summarizeAccount(auth.account);
  return NextResponse.json({
    object: "balance",
    account: summary.account,
    creditLanes: summary.creditLanes,
    monthlyRequests: summary.monthlyRequests,
    totals: summary.totals
  });
}
