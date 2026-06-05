import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { spendDailyQuota } from "./fishQuota";

let activeTempDir: string | null = null;

afterEach(async () => {
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("daily quota spending is serialized for concurrent requests", async () => {
  const quotaDir = await useTempQuotaDir();
  const day = new Date().toISOString().slice(0, 10);
  const principalId = "key:concurrent-quota-test";

  const results = await Promise.all(
    Array.from({ length: 20 }, () => spendDailyQuota(principalId, "external-fallback", 1, { quotaDir }))
  );
  const successfulResults = results.filter((result) => result.ok);
  const rejectedResults = results.filter((result) => !result.ok);
  const ledger = JSON.parse(await readFile(path.join(quotaDir, "daily_quotas.json"), "utf8")) as {
    days: Record<string, Record<string, { requests: number; routeCounts: Record<string, number> }>>;
  };

  assert.equal(successfulResults.length, 1);
  assert.equal(successfulResults[0]?.used, 1);
  assert.equal(rejectedResults.length, 19);
  assert.equal(ledger.days[day]?.[principalId]?.requests, 1);
  assert.equal(ledger.days[day]?.[principalId]?.routeCounts["external-fallback"], 1);
});

async function useTempQuotaDir() {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-quota-"));
  return activeTempDir;
}
