import { NextResponse } from "next/server";
import { summarizeOceanProofReadiness } from "@/lib/oceanProofReadiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await summarizeOceanProofReadiness();
  return NextResponse.json(readiness);
}
