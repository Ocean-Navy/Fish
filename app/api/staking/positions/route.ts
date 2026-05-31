import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { createStakingPosition, parseStakingPositionRequest, summarizeStakingCredits } from "@/lib/stakingCredits";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await summarizeStakingCredits();
  return NextResponse.json({
    object: "list",
    dataState: summary.dataState,
    data: summary.positions
  });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseStakingPositionRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_staking_position_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, ...(await createStakingPosition(parsed.data)) }, { status: 201 });
}
