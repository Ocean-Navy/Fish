import { NextResponse } from "next/server";
import { saveSupportTicket } from "@/lib/supportTickets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await saveSupportTicket(await request.json().catch(() => ({})));
  return NextResponse.json(result.ok ? { ok: true, id: result.id } : result, { status: result.status });
}
