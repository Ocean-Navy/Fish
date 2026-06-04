import type { FishChatRouteId } from "@/lib/fishRouter";

const activeByRoute = new Map<FishChatRouteId, number>();
let activeRequests = 0;

export type FishConcurrencyState = {
  route: FishChatRouteId;
  activeRequests: number;
  activeForRoute: number;
  limit: number;
};

export type FishConcurrencySlot =
  | ({
      ok: true;
      release: () => void;
    } & FishConcurrencyState)
  | ({
      ok: false;
    } & FishConcurrencyState);

export function tryAcquireFishConcurrencySlot(route: FishChatRouteId, limit: number): FishConcurrencySlot {
  const safeLimit = Math.max(1, Math.floor(limit));
  const activeForRoute = activeByRoute.get(route) ?? 0;
  if (activeRequests >= safeLimit) {
    return {
      ok: false,
      route,
      activeRequests,
      activeForRoute,
      limit: safeLimit
    };
  }

  activeRequests += 1;
  activeByRoute.set(route, activeForRoute + 1);
  let released = false;

  return {
    ok: true,
    route,
    activeRequests,
    activeForRoute: activeForRoute + 1,
    limit: safeLimit,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
      const nextRouteCount = Math.max(0, (activeByRoute.get(route) ?? 1) - 1);
      if (nextRouteCount === 0) {
        activeByRoute.delete(route);
      } else {
        activeByRoute.set(route, nextRouteCount);
      }
    }
  };
}

export function getFishConcurrencySnapshot() {
  return {
    activeRequests,
    activeByRoute: Object.fromEntries(activeByRoute.entries())
  };
}
