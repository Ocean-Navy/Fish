import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { FishChatRouteId } from "@/lib/fishRouter";

// The quota ledger lives next to the account ledger. Honoring FISH_LEDGER_DIR
// (resolved at call time, like fishLedger does) keeps tests hermetic — without
// it, `npm run test:app` on a production machine would mutate the live
// data/fish quota state and contend on its lock.
function defaultQuotaDir() {
  return process.env.FISH_LEDGER_DIR ? path.resolve(process.env.FISH_LEDGER_DIR) : path.join(process.cwd(), "data", "fish");
}
const QUOTA_LEDGER_FILE = "daily_quotas.json";
const QUOTA_LOCK_DIR = "daily_quotas.lock";
const QUOTA_LOCK_TIMEOUT_MS = 5000;
const QUOTA_LOCK_STALE_MS = 30000;

type DailyQuotaLedger = {
  days: Record<string, Record<string, DailyQuotaCounter>>;
};

type DailyQuotaCounter = {
  requests: number;
  routeCounts: Partial<Record<FishQuotaRouteId, number>>;
  updatedAt: string;
};

type DailyQuotaOptions = {
  quotaDir?: string;
  lockTimeoutMs?: number;
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

export async function spendDailyQuota(principalId: string, route: FishQuotaRouteId, limit: number, options: DailyQuotaOptions = {}): Promise<DailyQuotaResult> {
  const normalizedLimit = Math.max(0, Math.floor(limit));
  const quotaDir = options.quotaDir ?? defaultQuotaDir();

  return withQuotaLedgerLock(quotaDir, options.lockTimeoutMs ?? QUOTA_LOCK_TIMEOUT_MS, async () => {
    const ledger = await readQuotaLedger(quotaDir);
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
    await writeQuotaLedger(quotaDir, ledger);

    return {
      ok: true,
      used: updated.requests,
      remaining: Math.max(0, normalizedLimit - updated.requests),
      limit: normalizedLimit
    };
  });
}

async function readQuotaLedger(quotaDir: string): Promise<DailyQuotaLedger> {
  try {
    const raw = await readFile(path.join(quotaDir, QUOTA_LEDGER_FILE), "utf8");
    const parsed = JSON.parse(raw) as DailyQuotaLedger;
    return parsed && typeof parsed.days === "object" ? { days: parsed.days } : { days: {} };
  } catch {
    return { days: {} };
  }
}

async function writeQuotaLedger(quotaDir: string, ledger: DailyQuotaLedger) {
  await mkdir(quotaDir, { recursive: true });
  const tempPath = path.join(quotaDir, `${QUOTA_LEDGER_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  await writeFile(tempPath, JSON.stringify(ledger, null, 2));
  await rename(tempPath, path.join(quotaDir, QUOTA_LEDGER_FILE));
}

async function withQuotaLedgerLock<T>(quotaDir: string, lockTimeoutMs: number, action: () => Promise<T>): Promise<T> {
  const lockDir = path.join(quotaDir, QUOTA_LOCK_DIR);
  const lockOwner = { pid: process.pid, token: `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString() };
  const lockStartedAt = Date.now();

  await mkdir(quotaDir, { recursive: true });

  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(path.join(lockDir, "owner.json"), JSON.stringify(lockOwner, null, 2));
      break;
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }

      if (Date.now() - lockStartedAt > lockTimeoutMs) {
        throw new Error("daily_quota_lock_timeout");
      }

      await removeStaleQuotaLock(lockDir);
      await sleep(10 + Math.floor(Math.random() * 20));
    }
  }

  try {
    return await action();
  } finally {
    await releaseQuotaLedgerLock(lockDir, lockOwner.token);
  }
}

async function releaseQuotaLedgerLock(lockDir: string, lockToken: string) {
  try {
    const raw = await readFile(path.join(lockDir, "owner.json"), "utf8");
    const owner = JSON.parse(raw) as { token?: string };

    if (owner.token === lockToken) {
      await rm(lockDir, { force: true, recursive: true });
    }
  } catch {
    // If the lock disappeared or metadata is unreadable, there is no safe owned lock
    // to release. The timeout path still fails closed for future waiters.
  }
}

async function removeStaleQuotaLock(lockDir: string) {
  let createdAtMs = Number.NaN;
  try {
    const raw = await readFile(path.join(lockDir, "owner.json"), "utf8");
    const owner = JSON.parse(raw) as { createdAt?: string };
    createdAtMs = owner.createdAt ? Date.parse(owner.createdAt) : Number.NaN;
  } catch {
    // Missing or unreadable owner metadata is a crash artifact from the window
    // between mkdir(lockDir) and the owner.json write. Fall through to judging
    // staleness by the lock dir's own mtime — refusing forever would brick
    // every future quota operation until an operator deletes the dir by hand.
  }

  if (!Number.isFinite(createdAtMs)) {
    const lockStat = await stat(lockDir).catch(() => null);
    createdAtMs = lockStat?.mtimeMs ?? Number.NaN;
  }

  if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > QUOTA_LOCK_STALE_MS) {
    await rm(lockDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
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
