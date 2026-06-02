import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { checkOceanProviderReadiness, parseOceanProviderReadinessRequest } from "@/lib/oceanProviderReadiness";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseOceanProviderReadinessRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_ocean_provider_readiness_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await checkOceanProviderReadiness(parsed.data));
}
