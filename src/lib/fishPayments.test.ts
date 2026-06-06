import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createUsdcPayment, normalizeFishPaymentAmount, parseStripeCheckoutRequest, parseUsdcCheckoutRequest } from "./fishPayments";
import type { Account } from "./fishLedger";

const PAYMENT_ENV_KEYS = [
  "FISH_MAX_CHECKOUT_USD",
  "FISH_MAX_OUTSTANDING_PREPAID_CREDITS",
  "FISH_MIN_CHECKOUT_USD",
  "FISH_PAID_TOPUPS_PAUSED",
  "FISH_USDC_RECEIVE_ADDRESS"
] as const;

const originalPublicAppUrl = process.env.FISH_PUBLIC_APP_URL;
const TEST_PAYER_ADDRESS = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  for (const key of PAYMENT_ENV_KEYS) {
    delete process.env[key];
  }

  if (originalPublicAppUrl === undefined) {
    delete process.env.FISH_PUBLIC_APP_URL;
  } else {
    process.env.FISH_PUBLIC_APP_URL = originalPublicAppUrl;
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

test("checkout validation rejects mixed USD and credit amounts", () => {
  const parsed = parseStripeCheckoutRequest({ amountUsd: 1, credits: 100_000_000 });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.flatten().fieldErrors.credits, ["amountUsd and credits cannot both be supplied"]);
  }
});

test("USDC checkout validation rejects mixed USD and credit amounts", () => {
  const parsed = parseUsdcCheckoutRequest({
    amountUsd: 1,
    credits: 100_000_000,
    payerAddress: "0x1111111111111111111111111111111111111111"
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.flatten().fieldErrors.credits, ["amountUsd and credits cannot both be supplied"]);
  }
});

test("checkout validation accepts either USD or credits alone", () => {
  assert.equal(parseStripeCheckoutRequest({ amountUsd: 10 }).success, true);
  assert.equal(parseStripeCheckoutRequest({ credits: 1_000 }).success, true);
});

test("payment amount normalization rejects mixed USD and credit amounts", () => {
  const result = normalizeFishPaymentAmount({ amountUsd: 1, credits: 100000 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "ambiguous_checkout_amount");
  }
});

test("paid topups require an explicit prepaid liability cap", async () => {
  const result = await createUsdcPayment(testAccount(), { amountUsd: 5, payerAddress: TEST_PAYER_ADDRESS });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "paid_credit_liability_cap_not_configured");
  }
});

test("paid topups can be paused before payment requests are created", async () => {
  process.env.FISH_PAID_TOPUPS_PAUSED = "true";
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";

  const result = await createUsdcPayment(testAccount(), { amountUsd: 5, payerAddress: TEST_PAYER_ADDRESS });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "paid_topups_paused");
  }
});

test("checkout validation rejects cross-origin redirect URLs", () => {
  process.env.FISH_PUBLIC_APP_URL = "https://fish.example";
  const parsed = parseStripeCheckoutRequest({
    amountUsd: 10,
    successUrl: "https://attacker.example/checkout/success",
    cancelUrl: "https://fish.example/account?fish_payment=cancel"
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.flatten().fieldErrors.successUrl, ["successUrl must stay on the Fish app origin"]);
  }
});

test("checkout validation accepts same-origin redirect URLs", () => {
  process.env.FISH_PUBLIC_APP_URL = "https://fish.example";
  assert.equal(
    parseStripeCheckoutRequest({
      amountUsd: 10,
      successUrl: "https://fish.example/account?fish_payment=success",
      cancelUrl: "https://fish.example/account?fish_payment=cancel"
    }).success,
    true
  );
});

test("USDC checkout validation requires a payer address", () => {
  const parsed = parseUsdcCheckoutRequest({ amountUsd: 10 });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.flatten().fieldErrors.payerAddress, ["Required"]);
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
