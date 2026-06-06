import { NextResponse } from "next/server";
import { getOrCreateGuestAccount, parseChatCompletion } from "@/lib/fishLedger";
import { runFishChatGateway } from "@/lib/fishChatGateway";
import { getFishRouterConfig } from "@/lib/fishRouter";
import { resolveAnonymousGuestIdentity } from "@/lib/guestIdentity";
import { readJsonRequestBody } from "@/lib/requestBody";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJsonRequestBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: { message: body.error, type: "invalid_request_error", maxBytes: body.maxBytes } }, { status: body.status });
  }

  const parsed = parseChatCompletion(body.body);
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

  const identity = resolveAnonymousGuestIdentity();
  if (!identity.ok) {
    return NextResponse.json(
      {
        error: {
          message: identity.error,
          type: "service_unavailable_error"
        }
      },
      { status: identity.status }
    );
  }

  const guest = await getOrCreateGuestAccount(identity.guestId, Number(process.env.FISH_GUEST_CREDIT_GRANT ?? "25"));
  const routerConfig = getFishRouterConfig();
  const result = await runFishChatGateway(parsed.data, {
    ledger: guest.ledger,
    account: guest.account,
    principalId: identity.principalId,
    dailyQuotaLimit: routerConfig.guardrails.dailyAnonymousQuota,
    allowExternalFallback: false,
    authenticatedApiKey: false
  });

  return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
}
