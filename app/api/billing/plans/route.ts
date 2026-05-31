import { NextResponse } from "next/server";
import { FISH_PLANS } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    object: "list",
    data: FISH_PLANS
  });
}
