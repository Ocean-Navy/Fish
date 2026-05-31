import { NextResponse } from "next/server";
import { saveSubmission } from "@/lib/submissions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await saveSubmission("provider", await request.json().catch(() => ({})));
  return NextResponse.json(result.ok ? { ok: true, id: result.id } : result, { status: result.status });
}
