import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createUsdcPayment, normalizeFishPaymentAmount } from "./fishPayments";
import type { Account } from "./fishLedger";

const PAYMENT_ENV_KEYS = [
  "FISH_MAX_CHECKOUT_USD",
  "FISH_MAX_OUTSTANDING_PREPAID_CREDITS",
  "FISH_MIN_CHECKOUT_USD",
  "FISH_PAID_TOPUPS_PAUSED",
  "FISH_USDC_RECEIVE_ADDRESS"
] as const;

afterEach(() => {
  for (const key of PAYMENT_ENV_KEYS) {
    delete process.env[key];
  }
});

test("payment amount normalization derives credits from dollars", () => {
  const result = normalizeFishPaymentAmount({ amountUsd: 5 });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountUsd, 5);
    assert.equal(result.amountCents, 500);
    assert.equal(result.credits, 5000);
  }
});

test("payment amount normalization derives dollars from credits", () => {
  const result = normalizeFishPaymentAmount({ credits: 5000 });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountUsd, 5);
    assert.equal(result.amountCents, 500);
    assert.equal(result.credits, 5000);
  }
});

test("payment amount normalization rejects underpriced credit requests", () => {
  const result = normalizeFishPaymentAmount({ amountUsd: 1, credits: 100000 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "checkout_amount_credit_mismatch");
    assert.equal(result.expectedAmountUsd, 100);
  }
});

test("paid topups require an explicit prepaid liability cap", async () => {
  const result = await createUsdcPayment(testAccount(), { amountUsd: 5 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "paid_credit_liability_cap_not_configured");
  }
});

test("paid topups can be paused before payment requests are created", async () => {
  process.env.FISH_PAID_TOPUPS_PAUSED = "true";
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";

  const result = await createUsdcPayment(testAccount(), { amountUsd: 5 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "paid_topups_paused");
  }
});

function testAccount(): Account {
  return {
    id: "acct_payment_test",
    label: "Payment test account",
    keyHash: "hash",
    createdAt: "2026-06-05T00:00:00.000Z",
    rotatedAt: null,
    revokedAt: null,
    planId: "free",
    planActivatedAt: "2026-06-05T00:00:00.000Z",
    planExpiresAt: null,
    planSource: "pilot_key",
    creditBalance: 0,
    totalCreditsGranted: 0,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null
  };
}
