import { NextResponse } from "next/server";
import { readJsonRequestBody } from "@/lib/requestBody";
import { saveSubmission } from "@/lib/submissions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJsonRequestBody(request);
  if (!body.ok) {
    return NextResponse.json({ ok: false, status: body.status, error: body.error, maxBytes: body.maxBytes }, { status: body.status });
  }

  const result = await saveSubmission("waitlist", body.body);
  return NextResponse.json(result.ok ? { ok: true, id: result.id } : result, { status: result.status });
}
