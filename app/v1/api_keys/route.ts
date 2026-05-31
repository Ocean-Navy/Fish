import { NextResponse } from "next/server";
import { createApiKey, parseKeyRequest, requireAdmin } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

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
