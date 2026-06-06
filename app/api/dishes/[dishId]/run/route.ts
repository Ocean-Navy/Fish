import { NextResponse } from "next/server";
import { z } from "zod";
import { streamChatCompletion } from "@/lib/chatCompletionStream";
import { buildFishDishChatInput, getFishDish } from "@/lib/fishDishes";
import { authenticateRequest, getOrCreateGuestAccount } from "@/lib/fishLedger";
import { runFishChatGateway } from "@/lib/fishChatGateway";
import { getFishRouterConfig } from "@/lib/fishRouter";
import { anonymousGuestId } from "@/lib/guestIdentity";
import { readJsonRequestBody } from "@/lib/requestBody";

export const dynamic = "force-dynamic";

const DISH_METADATA_MAX_KEYS = 32;
const dishMetadataSchema = z.record(z.unknown()).refine((metadata) => Object.keys(metadata).length <= DISH_METADATA_MAX_KEYS, {
  message: `metadata cannot contain more than ${DISH_METADATA_MAX_KEYS} keys`
});

const dishRunSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  model: z.string().trim().min(1).optional(),
  max_tokens: z.number().int().min(1).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional().default(false),
  metadata: dishMetadataSchema.optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ dishId: string }> }) {
  const { dishId } = await params;
  const dish = getFishDish(dishId);
  if (!dish) {
    return NextResponse.json({ error: { message: "fish_dish_not_found", type: "not_found_error", dishId } }, { status: 404 });
  }
  if (!dish.enabled) {
    return NextResponse.json({ error: { message: "fish_dish_not_enabled", type: "feature_not_enabled", dishId: dish.id } }, { status: 501 });
  }

  const body = await readJsonRequestBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: { message: body.error, type: "invalid_request_error", maxBytes: body.maxBytes } }, { status: body.status });
  }

  const parsed = dishRunSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "invalid_fish_dish_request",
          type: "invalid_request_error",
          details: parsed.error.flatten().fieldErrors
        }
      },
      { status: 400 }
    );
  }

  if (dish.oceanBatch && !hasBearerToken(request)) {
    return NextResponse.json(
      {
        error: {
          message: "missing_bearer_token",
          type: "authentication_error",
          dishId: dish.id,
          route: "ocean-batch"
        }
      },
      { status: 401 }
    );
  }

  const routerConfig = getFishRouterConfig();
  const routeLabel = routerConfig.routes[routerConfig.activeRouteId].publicLabel;
  const chatInput = buildFishDishChatInput(
    dish,
    {
      prompt: parsed.data.prompt,
      model: parsed.data.model,
      maxTokens: parsed.data.max_tokens,
      temperature: parsed.data.temperature,
      stream: parsed.data.stream,
      metadata: parsed.data.metadata
    },
    routeLabel,
    routerConfig.guardrails.maxOutputTokens
  );
  const context = await resolveGatewayContext(request, routerConfig);
  if (!context.ok) {
    return NextResponse.json({ error: { message: context.error, type: "authentication_error" } }, { status: context.status });
  }

  const wantsStream = chatInput.stream === true;
  const result = await runFishChatGateway(wantsStream ? { ...chatInput, stream: false } : chatInput, {
    ledger: context.ledger,
    account: context.account,
    principalId: context.principalId,
    dailyQuotaLimit: context.dailyQuotaLimit,
    allowExternalFallback: context.allowExternalFallback,
    authenticatedApiKey: context.authenticatedApiKey
  });

  if (wantsStream && result.ok) {
    return streamChatCompletion(withDishMetadata(result.body, dish.id, context.accessMode));
  }

  return NextResponse.json(withDishMetadata(result.body, dish.id, context.accessMode), { status: result.ok ? 200 : result.status });
}

async function resolveGatewayContext(request: Request, routerConfig: ReturnType<typeof getFishRouterConfig>) {
  if (hasBearerToken(request)) {
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      return auth;
    }
    return {
      ok: true as const,
      ledger: auth.ledger,
      account: auth.account,
      principalId: `key:${auth.account.id}`,
      dailyQuotaLimit: routerConfig.guardrails.dailyKeyedQuota,
      allowExternalFallback: true,
      authenticatedApiKey: true,
      accessMode: "key" as const
    };
  }

  const guestId = anonymousGuestId();
  const guest = await getOrCreateGuestAccount(guestId, Number(process.env.FISH_GUEST_CREDIT_GRANT ?? "25"));
  return {
    ok: true as const,
    ledger: guest.ledger,
    account: guest.account,
    principalId: `guest:${guestId}`,
    dailyQuotaLimit: routerConfig.guardrails.dailyAnonymousQuota,
    allowExternalFallback: false,
    authenticatedApiKey: false,
    accessMode: "guest" as const
  };
}

function withDishMetadata(body: Record<string, unknown>, dishId: string, accessMode: "guest" | "key") {
  const fish = body.fish && typeof body.fish === "object" && !Array.isArray(body.fish) ? body.fish : {};
  return {
    ...body,
    fish: {
      ...fish,
      dishId,
      accessMode
    }
  };
}

function hasBearerToken(request: Request) {
  return /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "");
}
