import { randomUUID } from "node:crypto";
import { sumProviderCostForRouteSince } from "@/lib/fishLedger";
import type { FishChatRouteId, FishRouterConfig } from "@/lib/fishRouter";

export type RouteBudgetCheck =
  | {
      ok: true;
      route: FishChatRouteId;
      dailyBudgetUsd: number;
      spentUsd: number;
      reservedUsd: number;
      estimatedCostUsd: number;
      remainingUsd: number;
    }
  | {
      ok: false;
      route: FishChatRouteId;
      dailyBudgetUsd: number;
      spentUsd: number;
      reservedUsd: number;
      estimatedCostUsd: number;
      remainingUsd: number;
    };

export type RouteBudgetReservation = Extract<RouteBudgetCheck, { ok: true }> & {
  reservationId: string;
};

type ActiveRouteBudgetReservation = {
  id: string;
  amountUsd: number;
};

const activeReservations = new Map<FishChatRouteId, ActiveRouteBudgetReservation[]>();
const routeLocks = new Map<FishChatRouteId, Promise<void>>();

export async function checkRouteDailyBudget(input: {
  route: FishChatRouteId;
  promptTokens: number;
  maxOutputTokens: number;
  routerConfig: FishRouterConfig;
}): Promise<RouteBudgetCheck> {
  return withRouteBudgetLock(input.route, async () => buildRouteBudgetCheck(input));
}

export async function reserveRouteDailyBudget(input: {
  route: FishChatRouteId;
  promptTokens: number;
  maxOutputTokens: number;
  routerConfig: FishRouterConfig;
}): Promise<RouteBudgetReservation | Extract<RouteBudgetCheck, { ok: false }>> {
  return withRouteBudgetLock(input.route, async () => {
    const check = await buildRouteBudgetCheck(input);
    if (!check.ok) {
      return check;
    }

    const reservationId = randomUUID();
    const reservations = activeReservations.get(input.route) ?? [];
    reservations.push({
      id: reservationId,
      amountUsd: check.estimatedCostUsd
    });
    activeReservations.set(input.route, reservations);

    return {
      ...check,
      reservationId
    };
  });
}

export async function releaseRouteDailyBudgetReservation(reservation: RouteBudgetReservation | null | undefined) {
  if (!reservation) {
    return;
  }

  await withRouteBudgetLock(reservation.route, async () => {
    const reservations = activeReservations.get(reservation.route) ?? [];
    const remaining = reservations.filter((candidate) => candidate.id !== reservation.reservationId);
    if (remaining.length) {
      activeReservations.set(reservation.route, remaining);
    } else {
      activeReservations.delete(reservation.route);
    }
  });
}

async function buildRouteBudgetCheck(input: {
  route: FishChatRouteId;
  promptTokens: number;
  maxOutputTokens: number;
  routerConfig: FishRouterConfig;
}): Promise<RouteBudgetCheck> {
  const dailyBudgetUsd = input.routerConfig.budgets.dailyUsdByRoute[input.route];
  const estimatedCostUsd = estimateProviderCostUsd(input.route, input.promptTokens + input.maxOutputTokens, input.routerConfig);
  const spentUsd = await sumProviderCostForRouteSince(input.route === "ocean-demo-vllm" ? "ocean-demo-vllm" : input.route, startOfUtcDayIso());
  const reservedUsd = sumActiveReservations(input.route);
  const remainingUsd = Number(Math.max(0, dailyBudgetUsd - spentUsd - reservedUsd - estimatedCostUsd).toFixed(6));
  return {
    ok: spentUsd + reservedUsd + estimatedCostUsd <= dailyBudgetUsd,
    route: input.route,
    dailyBudgetUsd,
    spentUsd,
    reservedUsd,
    estimatedCostUsd,
    remainingUsd
  };
}

function sumActiveReservations(route: FishChatRouteId) {
  const reservations = activeReservations.get(route) ?? [];
  return Number(reservations.reduce((sum, reservation) => sum + reservation.amountUsd, 0).toFixed(6));
}

async function withRouteBudgetLock<T>(route: FishChatRouteId, task: () => T | Promise<T>): Promise<T> {
  const previous = routeLocks.get(route) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);
  routeLocks.set(route, next);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (routeLocks.get(route) === next) {
      routeLocks.delete(route);
    }
  }
}

function estimateProviderCostUsd(route: FishChatRouteId, maxTokens: number, routerConfig: FishRouterConfig) {
  const costUsdPer1kTokens =
    route === "ocean-demo-vllm"
      ? routerConfig.warm.costUsdPer1kTokens
      : route === "ocean-provider"
        ? routerConfig.selectedProvider.costUsdPer1kTokens
        : route === "external-fallback"
          ? routerConfig.external.costUsdPer1kTokens
          : 0;
  return Number(((maxTokens / 1000) * Math.max(0, costUsdPer1kTokens)).toFixed(6));
}

function startOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
