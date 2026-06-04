import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getOrCreateGuestAccount, parseChatCompletion } from "@/lib/fishLedger";
import { runFishChatGateway } from "@/lib/fishChatGateway";
import { getFishRouterConfig } from "@/lib/fishRouter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = parseChatCompletion(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_meal_order",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  const guestId = guestFingerprint(request);
  const guest = await getOrCreateGuestAccount(guestId, Number(process.env.FISH_GUEST_CREDIT_GRANT ?? "25"));
  const routerConfig = getFishRouterConfig();
  const result = await runFishChatGateway(parsed.data, {
    ledger: guest.ledger,
    account: guest.account,
    principalId: `guest:${guestId}`,
    dailyQuotaLimit: routerConfig.guardrails.dailyAnonymousQuota,
    allowExternalFallback: false
  });

  return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
}

function guestFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown-agent";
  const ip = forwardedFor || realIp || "local";
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 32);
}
