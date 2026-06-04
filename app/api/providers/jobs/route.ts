import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { parseProviderJobRequest, runProviderJob } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseProviderJobRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_provider_job_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await runProviderJob(parsed.data);
  return NextResponse.json(result.ok ? { ok: true, receipt: result.receipt, payoutEvent: result.payoutEvent } : { ok: false, error: result.error, receipt: result.receipt, payoutEvent: result.payoutEvent }, { status: result.status });
}
