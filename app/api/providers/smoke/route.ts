import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { parseProviderSmokeRequest, runProviderSmokeJob } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseProviderSmokeRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_provider_smoke_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await runProviderSmokeJob(parsed.data);
  return NextResponse.json(
    result.ok ? { ok: true, smoke: result.smoke, receipt: result.receipt, payoutEvent: result.payoutEvent } : { ok: false, error: result.error, smoke: result.smoke, receipt: result.receipt, payoutEvent: result.payoutEvent },
    { status: result.status }
  );
}
