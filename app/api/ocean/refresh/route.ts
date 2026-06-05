import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { collectOceanData } from "@/lib/oceanSupply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const data = await collectOceanData();
  return NextResponse.json(data.summary);
}
