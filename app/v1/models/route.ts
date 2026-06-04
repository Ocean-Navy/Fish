import { NextResponse } from "next/server";
import { FISH_MODELS } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    object: "list",
    data: FISH_MODELS
  });
}
