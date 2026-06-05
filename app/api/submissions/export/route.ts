import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { requireAdmin } from "@/lib/fishLedger";
import { listSubmissions, type StoredSubmission, type SubmissionKind } from "@/lib/submissions";

export const dynamic = "force-dynamic";

const submissionKinds = new Set(["all", "waitlist", "provider"]);

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "all";
  if (!submissionKinds.has(kind)) {
    return NextResponse.json({ error: { message: "invalid_submission_kind", type: "invalid_request_error" } }, { status: 400 });
  }

  const rows = await listSubmissions(kind as SubmissionKind | "all");
  if (url.searchParams.get("format") === "csv") {
    return new Response(submissionsToCsv(rows), {
      headers: {
        "content-disposition": `attachment; filename="fish-submissions-${kind}.csv"`,
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

function submissionsToCsv(rows: StoredSubmission[]) {
  const headers = [
    "createdAt",
    "kind",
    "id",
    "contact",
    "roles",
    "useCase",
    "expectedUsage",
    "nodeEndpoint",
    "healthEndpoint",
    "gpuType",
    "region",
    "priceHint",
    "payoutPreference",
    "supportContact",
    "approvedContainer",
    "noLoggingPolicy",
    "notes"
  ];
  const values = rows.map((row) => [
    row.createdAt,
    row.kind,
    row.id,
    row.body.contact,
    row.body.subscriberRoles.join(";"),
    row.body.useCase,
    row.body.expectedUsage,
    row.body.nodeEndpoint,
    row.body.healthEndpoint,
    row.body.gpuType,
    row.body.region,
    row.body.priceHint,
    row.body.payoutPreference,
    row.body.supportContact,
    row.body.approvedContainer,
    String(row.body.noLoggingPolicy),
    row.body.notes
  ]);

  return toCsv(headers, values);
}
