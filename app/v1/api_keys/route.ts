import { NextResponse } from "next/server";
import { authenticateRequest, createApiKey, parseKeyRequest, requireAdmin, summarizeAccount } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const summary = await summarizeAccount(auth.account);
  return NextResponse.json({
    object: "list",
    data: [
      {
        id: summary.account.id,
        label: summary.account.label,
        createdAt: summary.account.createdAt,
        rotatedAt: summary.account.rotatedAt,
        lastUsedAt: summary.account.lastUsedAt,
        status: summary.account.status,
        revokedAt: summary.account.revokedAt,
        planId: summary.account.planId,
        creditBalance: summary.account.creditBalance,
        requestCount: summary.account.requestCount
      }
    ]
  });
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: { message: admin.error, type: "authentication_error" } }, { status: admin.status });
  }

  const parsed = parseKeyRequest(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_api_key_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await createApiKey(parsed.data.label, parsed.data.creditGrant, parsed.data.planId);
  return NextResponse.json({
    object: "api_key",
    key: result.key,
    keyNotice: "Store this key now. Fish only stores a hash.",
    account: result.account
  });
}
