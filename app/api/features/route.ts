import { NextResponse } from "next/server";
import { FISH_DISHES, publicFishDish } from "@/lib/fishDishes";
import { listFishFeaturePolicies } from "@/lib/fishFeaturePolicy";
import { getFishRouterConfig } from "@/lib/fishRouter";

export const dynamic = "force-dynamic";

export function GET() {
  const routerConfig = getFishRouterConfig();
  return NextResponse.json({
    object: "list",
    data: FISH_DISHES.map(publicFishDish),
    activeRoute: {
      id: routerConfig.activeRouteId,
      label: routerConfig.routes[routerConfig.activeRouteId].publicLabel,
      isRealAi: routerConfig.routes[routerConfig.activeRouteId].isRealAi,
      status: routerConfig.routes[routerConfig.activeRouteId].status
    },
    guardrails: routerConfig.guardrails,
    policies: listFishFeaturePolicies(routerConfig).map((policy) => ({
      id: policy.id,
      label: policy.label,
      state: policy.state,
      primary: policy.primary,
      fallback: policy.fallback,
      enabled: policy.enabled,
      maxInputTokens: policy.maxInputTokens,
      maxOutputTokens: policy.maxOutputTokens,
      cap: policy.cap,
      modelAliases: policy.modelAliases
    }))
  });
}
