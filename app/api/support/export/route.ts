import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { requireAdmin } from "@/lib/fishLedger";
import { listSupportTickets, type StoredSupportTicket, type SupportTicketKind } from "@/lib/supportTickets";

export const dynamic = "force-dynamic";

const supportKinds = new Set(["all", "billing", "refund", "technical", "privacy", "provider", "other"]);

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "all";
  if (!supportKinds.has(kind)) {
    return NextResponse.json({ error: { message: "invalid_support_kind", type: "invalid_request_error" } }, { status: 400 });
  }

  const rows = await listSupportTickets(kind as SupportTicketKind | "all");
  if (url.searchParams.get("format") === "csv") {
    return new Response(supportTicketsToCsv(rows), {
      headers: {
        "content-disposition": `attachment; filename="fish-support-${kind}.csv"`,
        "content-type": "text/csv; charset=utf-8"
      }
    });
  }

  return NextResponse.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    rows
  });
}

function supportTicketsToCsv(rows: StoredSupportTicket[]) {
  const headers = ["createdAt", "id", "kind", "contact", "accountOrPaymentRef", "message"];
  const values = rows.map((row) => [row.createdAt, row.id, row.body.kind, row.body.contact, row.body.accountOrPaymentRef, row.body.message]);

  return toCsv(headers, values);
}
