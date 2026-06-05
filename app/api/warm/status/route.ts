import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { getWarmInferenceStatus } from "@/lib/warmInferenceStatus";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wantsLiveProbe = ["1", "true", "live"].includes(searchParams.get("probe")?.trim().toLowerCase() ?? "");

  if (wantsLiveProbe) {
    const admin = requireAdmin(request);
    if (!admin.ok) {
      return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
    }
  }

  return NextResponse.json(await getWarmInferenceStatus({ probe: wantsLiveProbe }));
}
