import { NextResponse } from "next/server";
import { summarizeBillingUsageAnalytics } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeBillingUsageAnalytics());
}
