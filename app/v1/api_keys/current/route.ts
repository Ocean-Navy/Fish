import { NextResponse } from "next/server";
import { authenticateRequest, revokeApiKey } from "@/lib/fishLedger";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: auth.error, type: "authentication_error" } }, { status: auth.status });
  }

  const result = await revokeApiKey(auth.ledger, auth.account);
  return NextResponse.json({
    object: "api_key",
    revoked: true,
    alreadyRevoked: result.alreadyRevoked,
    account: result.account
  });
}
