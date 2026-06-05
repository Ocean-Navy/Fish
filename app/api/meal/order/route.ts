import { NextResponse } from "next/server";
import { getOrCreateGuestAccount, parseChatCompletion } from "@/lib/fishLedger";
import { runFishChatGateway } from "@/lib/fishChatGateway";
import { getFishRouterConfig } from "@/lib/fishRouter";
import { getSharedGuestIdentity } from "@/lib/fishGuest";

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

  const guestIdentity = getSharedGuestIdentity();
  const guest = await getOrCreateGuestAccount(guestIdentity.guestId, Number(process.env.FISH_GUEST_CREDIT_GRANT ?? "25"));
  const routerConfig = getFishRouterConfig();
  const result = await runFishChatGateway(parsed.data, {
    ledger: guest.ledger,
    account: guest.account,
    principalId: guestIdentity.principalId,
    dailyQuotaLimit: routerConfig.guardrails.dailyAnonymousQuota,
    allowExternalFallback: false
  });

  return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
}
