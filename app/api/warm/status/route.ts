import { NextResponse } from "next/server";
import { getWarmInferenceStatus } from "@/lib/warmInferenceStatus";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getWarmInferenceStatus());
}
