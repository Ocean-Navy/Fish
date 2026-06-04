import { NextResponse } from "next/server";
import { collectOceanData } from "@/lib/oceanSupply";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await collectOceanData();
  return NextResponse.json({
    dataState: data.summary.dataState,
    lastUpdated: data.summary.lastUpdated,
    resources: data.resources.map(({ raw: _raw, ...resource }) => resource)
  });
}
