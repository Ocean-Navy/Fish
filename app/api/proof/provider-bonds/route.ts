import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/fishLedger";
import { createProviderBondPosition, parseProviderBondQuery, parseProviderBondRequest, summarizeProviderBonds } from "@/lib/providerBonds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = parseProviderBondQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_provider_bond_query",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await summarizeProviderBonds(parsed.data));
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseProviderBondRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_provider_bond_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await createProviderBondPosition(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.error, type: "invalid_request_error" } }, { status: result.status });
  }

  return NextResponse.json({ ok: true, created: result.created, position: result.position }, { status: result.created ? 201 : 200 });
}
