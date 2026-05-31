import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { parseBenchmarkRequest, runProviderBenchmark, summarizeBenchmarks } from "@/lib/providerBenchmarks";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeBenchmarks());
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseBenchmarkRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_benchmark_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await runProviderBenchmark(parsed.data);
  return NextResponse.json(result.ok ? { ok: true, run: result.run, receipt: result.receipt } : { ok: false, error: result.error, run: result.run, receipt: result.receipt }, { status: result.status });
}
