import { NextResponse } from "next/server";
import { requireAdmin, summarizeBillingUsageAnalytics } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  return NextResponse.json(await summarizeBillingUsageAnalytics());
}
