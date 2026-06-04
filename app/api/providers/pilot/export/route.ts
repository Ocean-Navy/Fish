import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { collectProviderPilotOperatorExport } from "@/lib/providerPilot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  return NextResponse.json(await collectProviderPilotOperatorExport());
}
