import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const originalCwd = process.cwd();
let activeTempDir: string | null = null;
let fishLedger: typeof import("./fishLedger");

before(async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-ledger-payment-idempotency-"));
  process.chdir(activeTempDir);
  fishLedger = await import("./fishLedger");
});

after(async () => {
  process.chdir(originalCwd);
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

function creditEntriesFile() {
  return path.join(process.cwd(), "data", "fish", "credit_entries.json");
}

test("a webhook retry with the same key is idempotent", async () => {
  const created = await fishLedger.createApiKey("Idempotent topup key", 0);

  const first = await fishLedger.addFishCredits({
    accountId: created.account.id,
    amount: 50,
    lane: "prepaid",
    reason: "topup_test",
    expiresAt: null,
    idempotencyKey: "evt_topup_1",
    paymentProviderEventId: "pi_topup_1"
  });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("first topup failed");
  assert.equal(first.idempotent, false);
  assert.equal(first.creditsRemaining, 50);

  const retry = await fishLedger.addFishCredits({
    accountId: created.account.id,
    amount: 50,
    lane: "prepaid",
    reason: "topup_test",
    expiresAt: null,
    idempotencyKey: "evt_topup_1",
    paymentProviderEventId: "pi_topup_1"
  });
  assert.equal(retry.ok, true);
  if (!retry.ok) throw new Error("retry topup failed");
  assert.equal(retry.idempotent, true);
  assert.equal(retry.creditsRemaining, 50);
});

test("a retry after a crash between the balance write and the entry append does not double-credit", async () => {
  const created = await fishLedger.createApiKey("Crash window topup key", 0);

  const first = await fishLedger.addFishCredits({
    accountId: created.account.id,
    amount: 40,
    lane: "prepaid",
    reason: "crash_window_test",
    expiresAt: null,
    idempotencyKey: "evt_crash_1",
    paymentProviderEventId: "pi_crash_1"
  });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("first topup failed");
  const grantedEntryId = first.entry.entryId;

  // Simulate the crash: the balance write (accounts.json, which now carries the
  // idempotency record) survived, but the credit entry append never happened.
  const raw = JSON.parse(await readFile(creditEntriesFile(), "utf8")) as { entries: Array<{ entryId: string }> };
  raw.entries = raw.entries.filter((entry) => entry.entryId !== grantedEntryId);
  await writeFile(creditEntriesFile(), JSON.stringify(raw, null, 2));

  const retry = await fishLedger.addFishCredits({
    accountId: created.account.id,
    amount: 40,
    lane: "prepaid",
    reason: "crash_window_test",
    expiresAt: null,
    idempotencyKey: "evt_crash_1",
    paymentProviderEventId: "pi_crash_1"
  });
  assert.equal(retry.ok, true);
  if (!retry.ok) throw new Error("retry topup failed");
  assert.equal(retry.idempotent, true, "retry after crash must dedupe via the account-side record");
  assert.equal(retry.creditsRemaining, 40, "retry must not grant the credits a second time");

  // The audit log must be healed: the lost entry is appended back.
  const healed = JSON.parse(await readFile(creditEntriesFile(), "utf8")) as { entries: Array<{ entryId: string }> };
  assert.ok(
    healed.entries.some((entry) => entry.entryId === grantedEntryId),
    "the lost credit entry must be restored on the dedupe hit"
  );
});

test("subscription activation retries are idempotent across the same crash window", async () => {
  const created = await fishLedger.createApiKey("Crash window subscription key", 0);

  const first = await fishLedger.activateFishSubscription({
    accountId: created.account.id,
    planId: "pro",
    reason: "crash_window_subscription_test",
    idempotencyKey: "evt_sub_1",
    paymentProviderEventId: "pi_sub_1"
  });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("subscription activation failed");
  const grantedEntryId = first.entry.entryId;
  const balanceAfterFirst = first.creditsRemaining;

  const raw = JSON.parse(await readFile(creditEntriesFile(), "utf8")) as { entries: Array<{ entryId: string }> };
  raw.entries = raw.entries.filter((entry) => entry.entryId !== grantedEntryId);
  await writeFile(creditEntriesFile(), JSON.stringify(raw, null, 2));

  const retry = await fishLedger.activateFishSubscription({
    accountId: created.account.id,
    planId: "pro",
    reason: "crash_window_subscription_test",
    idempotencyKey: "evt_sub_1",
    paymentProviderEventId: "pi_sub_1"
  });
  assert.equal(retry.ok, true);
  if (!retry.ok) throw new Error("subscription retry failed");
  assert.equal(retry.idempotent, true);
  assert.equal(retry.creditsRemaining, balanceAfterFirst, "the monthly grant must not be applied twice");
});
