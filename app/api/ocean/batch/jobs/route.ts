import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/fishLedger";
import { parseOceanBatchJobRequest, runOceanBatchJob, summarizeOceanBatchJobs } from "@/lib/oceanBatch";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeOceanBatchJobs());
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const parsed = parseOceanBatchJobRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_ocean_batch_job",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await runOceanBatchJob(parsed.data, {
    ledger: auth.ledger,
    account: auth.account
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          message: result.error,
          type: result.status === 402 ? "billing_error" : "ocean_batch_error",
          needed: "needed" in result ? result.needed : undefined,
          available: "available" in result ? result.available : undefined
        },
        receipt: "receipt" in result ? result.receipt : undefined
      },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    receipt: result.receipt,
    usageReceipt: result.usageReceipt,
    creditsRemaining: result.creditsRemaining
  });
}
