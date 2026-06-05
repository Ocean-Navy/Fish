const WINDOW_MS = 60_000;
const DEFAULT_MAX_BUCKETS = 10_000;

const configuredMaxBuckets = Number(process.env.FISH_RATE_LIMIT_MAX_BUCKETS ?? DEFAULT_MAX_BUCKETS);
const MAX_BUCKETS = Number.isFinite(configuredMaxBuckets) ? Math.max(1, Math.floor(configuredMaxBuckets)) : DEFAULT_MAX_BUCKETS;

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
let lastPrunedWindowStartMs = 0;

export function spendFishMinuteRateLimit(principalId: string, limit: number, nowMs = Date.now()): FishRateLimitResult {
  const safeLimit = Math.max(1, Math.floor(limit));
  const windowStartMs = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
  const resetAt = new Date(windowStartMs + WINDOW_MS).toISOString();

  pruneExpiredBuckets(windowStartMs);

  const existing = buckets.get(principalId);
  const bucket = existing && existing.windowStartMs === windowStartMs ? existing : { windowStartMs, used: 0 };

  reserveBucketSlot(principalId);

  if (bucket.used >= safeLimit) {
    rememberBucket(principalId, bucket);
    return {
      ok: false,
      limit: safeLimit,
      used: bucket.used,
      remaining: 0,
      resetAt
    };
  }

  bucket.used += 1;
  rememberBucket(principalId, bucket);
  return {
    ok: true,
    limit: safeLimit,
    used: bucket.used,
    remaining: Math.max(0, safeLimit - bucket.used),
    resetAt
  };
}

function pruneExpiredBuckets(windowStartMs: number) {
  if (lastPrunedWindowStartMs >= windowStartMs) return;

  for (const [principalId, bucket] of buckets) {
    if (bucket.windowStartMs < windowStartMs) {
      buckets.delete(principalId);
    }
  }

  lastPrunedWindowStartMs = windowStartMs;
}

function reserveBucketSlot(principalId: string) {
  if (buckets.has(principalId)) return;

  while (buckets.size >= MAX_BUCKETS) {
    const oldestPrincipalId = buckets.keys().next().value;
    if (oldestPrincipalId === undefined) return;
    buckets.delete(oldestPrincipalId);
  }
}

function rememberBucket(principalId: string, bucket: RateLimitBucket) {
  buckets.delete(principalId);
  buckets.set(principalId, bucket);
}

export function getFishMinuteRateLimitBucketCountForTests() {
  return buckets.size;
}

export function resetFishMinuteRateLimitForTests() {
  buckets.clear();
  lastPrunedWindowStartMs = 0;
}
