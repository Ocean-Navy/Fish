import { NextResponse } from "next/server";
import { saveSupportTicket } from "@/lib/supportTickets";

export const dynamic = "force-dynamic";

const supportRateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const clientKey = supportRateLimitKey(request);
  const rateLimit = checkSupportRateLimit(clientKey);
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

function checkSupportRateLimit(clientKey: string) {
  const now = Date.now();
  const windowMs = supportRateLimitWindowMs();
  const limit = supportRateLimitPerWindow();
  const current = supportRateBuckets.get(clientKey);
  if (!current || current.resetAt <= now) {
    supportRateBuckets.set(clientKey, { count: 1, resetAt: now + windowMs });
    pruneSupportRateBuckets(now);
    return { ok: true as const };
  }

  if (current.count >= limit) {
    return { ok: false as const };
  }

  current.count += 1;
  return { ok: true as const };
}

function pruneSupportRateBuckets(now: number) {
  for (const [key, bucket] of supportRateBuckets) {
    if (bucket.resetAt <= now) {
      supportRateBuckets.delete(key);
    }
  }
}

function supportRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "anonymous";
}

function supportMaxBodyBytes() {
  return positiveIntegerEnv("FISH_SUPPORT_MAX_BODY_BYTES", 8192);
}

function supportRateLimitPerWindow() {
  return positiveIntegerEnv("FISH_SUPPORT_RATE_LIMIT_PER_MINUTE", 10);
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
