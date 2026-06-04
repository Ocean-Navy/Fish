import { NextResponse } from "next/server";
import { summarizeFishUsage } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await summarizeFishUsage();
  return NextResponse.json({
    ...summary,
    message:
      summary.requests > 0
        ? "Fish API prototype usage is being recorded locally."
        : "Usage metrics start after API keys make Fish prototype calls."
  });
}
