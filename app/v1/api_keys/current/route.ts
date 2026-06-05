import { NextResponse } from "next/server";
import { authenticateRequest, parseKeyUpdate, revokeApiKey, updateApiKey } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const result = await revokeApiKey(auth.ledger, auth.account, auth.keyHash);
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.error, type: "authentication_error" } }, { status: result.status });
  }

  return NextResponse.json({
    object: "api_key",
    revoked: true,
    alreadyRevoked: result.alreadyRevoked,
    account: result.account
  });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const parsed = parseKeyUpdate(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_api_key_update",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const result = await updateApiKey(auth.ledger, auth.account, parsed.data, auth.keyHash);
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.error, type: "authentication_error" } }, { status: result.status });
  }

  return NextResponse.json({
    object: "api_key",
    rotated: result.rotated,
    key: result.key,
    keyNotice: result.key ? "Store this key now. Fish only stores a hash, and the previous key no longer works." : null,
    account: result.account
  });
}
