import { NextResponse } from "next/server";
import { getFishDashboardSummary } from "@/lib/dashboardSummary";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getFishDashboardSummary());
}
