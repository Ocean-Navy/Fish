import { NextResponse } from "next/server";
import { summarizeStakingCredits } from "@/lib/stakingCredits";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeStakingCredits());
}
