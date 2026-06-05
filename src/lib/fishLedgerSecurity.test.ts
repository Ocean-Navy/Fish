import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFishModelAccess,
  getActiveFishPlan,
  summarizeSpendableCreditLaneBalances,
  type Account,
  type CreditLedgerEntry,
} from "./fishLedger";

const EXPIRED_AT = "2024-01-02T00:00:00.000Z";
const NOW = new Date("2026-06-05T00:00:00.000Z");

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "acct_security_test",
    label: "Security test account",
    keyHash: "hash",
    createdAt: "2024-01-01T00:00:00.000Z",
    planId: "team-api",
    planActivatedAt: "2024-01-01T00:00:00.000Z",
    planExpiresAt: EXPIRED_AT,
    planSource: "operator_subscription",
    creditBalance: 100,
    totalCreditsGranted: 100,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null,
    ...overrides,
  };
}

function entry(overrides: Partial<CreditLedgerEntry>): CreditLedgerEntry {
  return {
    entryId: "entry_security_test",
    accountId: "acct_security_test",
    lane: "subscription",
    kind: "grant",
    amount: 0,
    requestId: null,
    receiptId: null,
    expiresAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    operatorReason: null,
    ...overrides,
  };
}

test("expired operator subscriptions resolve to free plan entitlements", () => {
  const expiredAccount = account();
  const activeAccount = account({ planExpiresAt: "2027-01-02T00:00:00.000Z" });

  assert.equal(getActiveFishPlan(expiredAccount, NOW).planId, "free");
  assert.equal(getActiveFishPlan(activeAccount, NOW).planId, "team-api");

  const expiredModelAccess = checkFishModelAccess("ocean-batch-placeholder", expiredAccount, NOW);
  const activeModelAccess = checkFishModelAccess("ocean-batch-placeholder", activeAccount, NOW);

  assert.equal(expiredModelAccess.ok, false);
  if (!expiredModelAccess.ok) {
    assert.equal(expiredModelAccess.status, 403);
    assert.equal(expiredModelAccess.plan.planId, "free");
  }
  assert.equal(activeModelAccess.ok, true);
  if (activeModelAccess.ok) {
    assert.equal(activeModelAccess.plan.planId, "team-api");
  }
});

test("expired positive credit entries are excluded from spendable lane balances", () => {
  const balances = summarizeSpendableCreditLaneBalances(
    [
      entry({ amount: 50, lane: "subscription", expiresAt: EXPIRED_AT }),
      entry({ amount: 2, lane: "grant", expiresAt: null }),
      entry({ amount: -1, lane: "subscription", kind: "debit", expiresAt: null }),
      entry({ amount: 7, lane: "prepaid", expiresAt: "2027-01-02T00:00:00.000Z" }),
    ],
    NOW.toISOString(),
  );

  assert.equal(balances.get("subscription"), -1);
  assert.equal(balances.get("grant"), 2);
  assert.equal(balances.get("prepaid"), 7);
});
