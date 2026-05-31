import { NextResponse } from "next/server";
import { summarizeMarketMaking } from "@/lib/marketMaking";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeMarketMaking());
}
