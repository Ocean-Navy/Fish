import type { FishChatRouteId } from "@/lib/fishRouter";

/**
 * In-memory health memory for outbound chat routes (single-instance demo scale,
 * consistent with the in-memory concurrency and rate-limit stores).
 *
 * Purpose: the public UI must not claim "Live AI" from config presence alone.
 * The gateway records real outcomes here; status surfaces read them so a
 * configured-but-dead backend shows as unreachable instead of healthy.
 */

const DEGRADED_WINDOW_MS = 5 * 60_000;

export type FishRouteHealthState = "ok" | "degraded" | "unknown";

export type FishRouteHealth = {
  state: FishRouteHealthState;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
};

type RouteHealthRecord = {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastErrorCode: string | null;
};

const routeHealthRecords = new Map<FishChatRouteId, RouteHealthRecord>();

function routeRecord(route: FishChatRouteId): RouteHealthRecord {
  const existing = routeHealthRecords.get(route);
  if (existing) {
    return existing;
  }
  const fresh: RouteHealthRecord = { lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null };
  routeHealthRecords.set(route, fresh);
  return fresh;
}

export function recordFishRouteSuccess(route: FishChatRouteId) {
  const entry = routeRecord(route);
  entry.lastSuccessAt = Date.now();
  // A successful call proves the route is reachable now; clear the failure state
  // (also avoids same-millisecond ties between success and failure timestamps).
  entry.lastFailureAt = null;
  entry.lastErrorCode = null;
}

export function recordFishRouteFailure(route: FishChatRouteId, errorCode: string) {
  const entry = routeRecord(route);
  entry.lastFailureAt = Date.now();
  entry.lastErrorCode = errorCode;
}

export function getFishRouteHealth(route: FishChatRouteId, now = Date.now()): FishRouteHealth {
  // The mock route never makes outbound calls; it cannot be unreachable.
  if (route === "mock") {
    return { state: "ok", lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null };
  }

  const entry = routeHealthRecords.get(route);
  if (!entry || (entry.lastSuccessAt === null && entry.lastFailureAt === null)) {
    return { state: "unknown", lastSuccessAt: null, lastFailureAt: null, lastErrorCode: null };
  }

  const failedRecently = entry.lastFailureAt !== null && now - entry.lastFailureAt <= DEGRADED_WINDOW_MS;
  const state: FishRouteHealthState = failedRecently ? "degraded" : "ok";

  return {
    state,
    lastSuccessAt: entry.lastSuccessAt ? new Date(entry.lastSuccessAt).toISOString() : null,
    lastFailureAt: entry.lastFailureAt ? new Date(entry.lastFailureAt).toISOString() : null,
    lastErrorCode: state === "degraded" ? entry.lastErrorCode : null
  };
}

export function resetFishRouteHealthForTests() {
  routeHealthRecords.clear();
}
