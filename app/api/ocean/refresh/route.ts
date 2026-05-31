import { NextResponse } from "next/server";
import { collectOceanData } from "@/lib/oceanSupply";

export const dynamic = "force-dynamic";

export async function POST() {
  const data = await collectOceanData();
  return NextResponse.json(data.summary);
}
