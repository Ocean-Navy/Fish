import { NextResponse } from "next/server";
import { saveSupportTicket } from "@/lib/supportTickets";

export const dynamic = "force-dynamic";

type SupportRateLimitCheck = { key: string; limit: number };

type SupportRateBucket = { count: number; resetAt: number };

const supportRateBuckets = new Map<string, SupportRateBucket>();

export async function POST(request: Request) {
  const rateLimit = checkSupportRateLimit(supportRateLimitChecks(request));
  if (!rateLimit.ok) {
    return NextResponse.json({ ok: false, error: "support_rate_limited" }, { status: 429 });
  }

  const body = await readJsonWithLimit(request, supportMaxBodyBytes());
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }

  const result = await saveSupportTicket(body.value);
  return NextResponse.json(result.ok ? { ok: true, id: result.id } : result, { status: result.status });
}

async function readJsonWithLimit(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false as const, status: 413, error: "support_request_too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false as const, status: 400, error: "invalid_support_ticket" };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false as const, status: 413, error: "support_request_too_large" };
    }
    chunks.push(value);
  }

  try {
    const raw = Buffer.concat(chunks, received).toString("utf8");
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false as const, status: 400, error: "invalid_support_ticket" };
  }
}

function checkSupportRateLimit(checks: SupportRateLimitCheck[]) {
  const now = Date.now();
  const windowMs = supportRateLimitWindowMs();
  pruneSupportRateBuckets(now);

  for (const check of checks) {
    const current = supportRateBuckets.get(check.key);
    if (current && current.count >= check.limit) {
      return { ok: false as const };
    }
  }

  for (const check of checks) {
    const current = supportRateBuckets.get(check.key);
    if (!current || current.resetAt <= now) {
      supportRateBuckets.set(check.key, { count: 1, resetAt: now + windowMs });
      continue;
    }
    current.count += 1;
  }

  return { ok: true as const };
}

function pruneSupportRateBuckets(now: number) {
  for (const [key, bucket] of supportRateBuckets) {
    if (bucket.resetAt <= now) {
      supportRateBuckets.delete(key);
    }
  }
}

function supportRateLimitChecks(request: Request): SupportRateLimitCheck[] {
  const checks: SupportRateLimitCheck[] = [{ key: "global", limit: supportGlobalRateLimitPerWindow() }];

  const trustedProxyKey = trustedProxyRateLimitKey(request);
  checks.push({
    key: trustedProxyKey ? `client:${trustedProxyKey}` : "client:anonymous",
    limit: supportRateLimitPerWindow()
  });
  return checks;
}

function trustedProxyRateLimitKey(request: Request) {
  if (!trustProxyHeaders()) {
    return undefined;
  }

  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || undefined;
}

function trustProxyHeaders() {
  return ["1", "true", "yes"].includes(
    (process.env.FISH_SUPPORT_TRUST_PROXY_HEADERS || "").toLowerCase()
  );
}

function supportMaxBodyBytes() {
  return positiveIntegerEnv("FISH_SUPPORT_MAX_BODY_BYTES", 8192);
}

function supportRateLimitPerWindow() {
  return positiveIntegerEnv("FISH_SUPPORT_RATE_LIMIT_PER_MINUTE", 10);
}

function supportGlobalRateLimitPerWindow() {
  const perClientLimit = supportRateLimitPerWindow();
  return positiveIntegerEnv(
    "FISH_SUPPORT_GLOBAL_RATE_LIMIT_PER_MINUTE",
    Math.max(perClientLimit * 20, perClientLimit)
  );
}

function supportRateLimitWindowMs() {
  return positiveIntegerEnv("FISH_SUPPORT_RATE_LIMIT_WINDOW_MS", 60_000);
}

function positiveIntegerEnv(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function resetSupportRateLimitForTest() {
  supportRateBuckets.clear();
}
