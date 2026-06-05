import { NextResponse } from "next/server";
import { collectOceanData, publicOceanSummary } from "@/lib/oceanSupply";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await collectOceanData();
  return NextResponse.json(publicOceanSummary(data.summary));
}
