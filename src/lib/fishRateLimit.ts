const WINDOW_MS = 60_000;

type RateLimitBucket = {
  windowStartMs: number;
  used: number;
};

type FishRateLimitState = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
};

export type FishRateLimitResult =
  | ({
      ok: true;
    } & FishRateLimitState)
  | ({
      ok: false;
    } & FishRateLimitState);

const buckets = new Map<string, RateLimitBucket>();

export function spendFishMinuteRateLimit(principalId: string, limit: number, nowMs = Date.now()): FishRateLimitResult {
  const safeLimit = Math.max(1, Math.floor(limit));
  const windowStartMs = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
  const resetAt = new Date(windowStartMs + WINDOW_MS).toISOString();
  const existing = buckets.get(principalId);
  const bucket = existing && existing.windowStartMs === windowStartMs ? existing : { windowStartMs, used: 0 };

  if (bucket.used >= safeLimit) {
    buckets.set(principalId, bucket);
    return {
      ok: false,
      limit: safeLimit,
      used: bucket.used,
      remaining: 0,
      resetAt
    };
  }

  bucket.used += 1;
  buckets.set(principalId, bucket);
  return {
    ok: true,
    limit: safeLimit,
    used: bucket.used,
    remaining: Math.max(0, safeLimit - bucket.used),
    resetAt
  };
}
