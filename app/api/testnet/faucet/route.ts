import { NextResponse } from "next/server";
import { resolveTestnetFaucetClientIdentity } from "@/lib/testnetFaucetIdentity";
import { claimTestnetFaucet, parseTestnetFaucetClaim, summarizeTestnetFaucet } from "@/lib/testnetFaucet";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeTestnetFaucet());
}

export async function POST(request: Request) {
  const parsed = parseTestnetFaucetClaim(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_testnet_faucet_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const identity = resolveTestnetFaucetClientIdentity(request.headers);
  if (!identity.ok) {
    return NextResponse.json({ error: { message: identity.error, type: "testnet_faucet_error" } }, { status: identity.status });
  }

  const result = await claimTestnetFaucet(parsed.data.walletAddress, identity.ipAddress);
  if (!result.ok) {
    return NextResponse.json({ error: { message: result.error, type: "testnet_faucet_error", resetAt: "resetAt" in result ? result.resetAt : undefined } }, { status: result.status });
  }

  return NextResponse.json({
    object: "testnet_faucet_claim",
    claim: {
      claimId: result.claim.claimId,
      walletPrefix: result.claim.walletPrefix,
      createdAt: result.claim.createdAt,
      chainId: result.claim.chainId,
      ethTxHash: result.claim.ethTxHash,
      oceanTxHash: result.claim.oceanTxHash,
      usdcTxHash: result.claim.usdcTxHash
    },
    grants: result.grants,
    explorer: result.explorer
  });
}
