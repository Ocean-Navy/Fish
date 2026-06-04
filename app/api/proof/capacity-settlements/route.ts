import { NextResponse } from "next/server";
import { createCapacitySettlement, parseCapacitySettlementRequest, summarizeCapacitySettlements } from "@/lib/capacitySettlements";
import { requireAdmin } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeCapacitySettlements());
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseCapacitySettlementRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_capacity_settlement_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  try {
    const result = await createCapacitySettlement(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : "capacity_settlement_failed",
          type: "contract_settlement_error"
        }
      },
      { status: 502 }
    );
  }
}
