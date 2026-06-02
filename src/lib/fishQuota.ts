import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FishChatRouteId } from "@/lib/fishRouter";

const QUOTA_DIR = path.join(process.cwd(), "data", "fish");
const QUOTA_PATH = path.join(QUOTA_DIR, "daily_quotas.json");

type DailyQuotaLedger = {
  days: Record<string, Record<string, DailyQuotaCounter>>;
};

type DailyQuotaCounter = {
  requests: number;
  routeCounts: Partial<Record<FishQuotaRouteId, number>>;
  updatedAt: string;
};

export type FishQuotaRouteId = FishChatRouteId | "ocean-provider";

export type DailyQuotaResult =
  | {
      ok: true;
      used: number;
      remaining: number;
      limit: number;
    }
  | {
      ok: false;
      status: 429;
      error: "daily_quota_exceeded";
      used: number;
      remaining: number;
      limit: number;
    };

export async function spendDailyQuota(principalId: string, route: FishQuotaRouteId, limit: number): Promise<DailyQuotaResult> {
  const normalizedLimit = Math.max(0, Math.floor(limit));
  const ledger = await readQuotaLedger();
  const day = new Date().toISOString().slice(0, 10);
  const dayLedger = ledger.days[day] ?? {};
  const current = dayLedger[principalId] ?? { requests: 0, routeCounts: {}, updatedAt: new Date().toISOString() };

  if (current.requests >= normalizedLimit) {
    return {
      ok: false,
      status: 429,
      error: "daily_quota_exceeded",
      used: current.requests,
      remaining: 0,
      limit: normalizedLimit
    };
  }

  const updated: DailyQuotaCounter = {
    requests: current.requests + 1,
    routeCounts: {
      ...current.routeCounts,
      [route]: (current.routeCounts[route] ?? 0) + 1
    },
    updatedAt: new Date().toISOString()
  };
  ledger.days = pruneOldDays({ ...ledger.days, [day]: { ...dayLedger, [principalId]: updated } });
  await writeQuotaLedger(ledger);

  return {
    ok: true,
    used: updated.requests,
    remaining: Math.max(0, normalizedLimit - updated.requests),
    limit: normalizedLimit
  };
}

async function readQuotaLedger(): Promise<DailyQuotaLedger> {
  try {
    const raw = await readFile(QUOTA_PATH, "utf8");
    const parsed = JSON.parse(raw) as DailyQuotaLedger;
    return parsed && typeof parsed.days === "object" ? { days: parsed.days } : { days: {} };
  } catch {
    return { days: {} };
  }
}

async function writeQuotaLedger(ledger: DailyQuotaLedger) {
  await mkdir(QUOTA_DIR, { recursive: true });
  await writeFile(QUOTA_PATH, JSON.stringify(ledger, null, 2));
}

function pruneOldDays(days: DailyQuotaLedger["days"]) {
  const keep = new Set<string>();
  const now = new Date();
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(now);
    day.setUTCDate(now.getUTCDate() - offset);
    keep.add(day.toISOString().slice(0, 10));
  }
  return Object.fromEntries(Object.entries(days).filter(([day]) => keep.has(day)));
}
