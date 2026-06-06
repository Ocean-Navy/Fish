import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createUsdcPayment, normalizeFishPaymentAmount, parseStripeCheckoutRequest, parseUsdcCheckoutRequest, summarizeBillingReadiness } from "./fishPayments";
import type { Account } from "./fishLedger";

const PAYMENT_ENV_KEYS = [
  "FISH_MAX_CHECKOUT_USD",
  "FISH_MAX_OUTSTANDING_PREPAID_CREDITS",
  "FISH_MIN_CHECKOUT_USD",
  "FISH_PAID_TOPUPS_PAUSED",
  "FISH_BILLING_REFUND_POLICY_URL",
  "FISH_BILLING_SUPPORT_URL",
  "FISH_STRIPE_SECRET_KEY",
  "FISH_STRIPE_WEBHOOK_SECRET",
  "FISH_USDC_RECEIVE_ADDRESS",
  "FISH_USDC_RPC_URL",
  "FISH_USDC_CHAIN_ID",
  "FISH_USDC_TOKEN_ADDRESS",
  "FISH_USDC_DECIMALS"
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

test("billing readiness is unavailable without a liability cap or provider", () => {
  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, false);
  assert.equal(readiness.dataState, "unavailable");
  assert.deepEqual(readiness.liabilityCap, {
    configured: false,
    maxOutstandingPrepaidCredits: null,
    maxOutstandingPrepaidUsd: null
  });
  assert.equal(readiness.customerCare.supportConfigured, false);
  assert.equal(readiness.customerCare.refundPolicyConfigured, false);
  assert.deepEqual(readiness.blockers, ["paid_credit_liability_cap_not_configured", "payment_provider_not_configured", "billing_support_url_not_configured", "billing_refund_policy_not_configured"]);
});

test("billing readiness keeps providers disabled while paid topups are paused", () => {
  process.env.FISH_PAID_TOPUPS_PAUSED = "true";
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";
  process.env.FISH_USDC_RECEIVE_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.FISH_USDC_RPC_URL = "https://base-mainnet.example";
  process.env.FISH_BILLING_SUPPORT_URL = "mailto:support@op.fish";
  process.env.FISH_BILLING_REFUND_POLICY_URL = "https://op.fish/refunds";

  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, false);
  assert.equal(readiness.dataState, "snapshot");
  assert.deepEqual(readiness.liabilityCap, {
    configured: true,
    maxOutstandingPrepaidCredits: 100000,
    maxOutstandingPrepaidUsd: 100
  });
  assert.equal(readiness.providers.usdc.configured, true);
  assert.equal(readiness.providers.usdc.enabled, false);
  assert.deepEqual(readiness.blockers, ["paid_topups_paused"]);
});

test("billing readiness rejects USDC checkout on a non-base-mainnet chain", () => {
  configureUsdcCheckoutEnv();
  process.env.FISH_USDC_CHAIN_ID = "84532";

  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, false);
  assert.equal(readiness.providers.usdc.configured, false);
  assert.equal(readiness.providers.usdc.chainConfigured, false);
  assert.equal(readiness.providers.usdc.tokenConfigured, true);
  assert.deepEqual(readiness.blockers, ["payment_provider_not_configured"]);
  assert.ok(readiness.warnings.includes("USDC checkout must use Base mainnet chain id 8453."));
});

test("billing readiness rejects USDC checkout with a non-canonical token", () => {
  configureUsdcCheckoutEnv();
  process.env.FISH_USDC_TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";

  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, false);
  assert.equal(readiness.providers.usdc.configured, false);
  assert.equal(readiness.providers.usdc.chainConfigured, true);
  assert.equal(readiness.providers.usdc.tokenConfigured, false);
  assert.deepEqual(readiness.blockers, ["payment_provider_not_configured"]);
  assert.ok(readiness.warnings.includes("USDC checkout must use canonical Base USDC 0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913."));
});

test("billing readiness enables configured providers only after caps are set and topups are unpaused", () => {
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";
  process.env.FISH_BILLING_SUPPORT_URL = "mailto:support@op.fish";
  process.env.FISH_BILLING_REFUND_POLICY_URL = "https://op.fish/refunds";
  process.env.FISH_STRIPE_SECRET_KEY = "sk_test_configured";
  process.env.FISH_STRIPE_WEBHOOK_SECRET = "whsec_configured";

  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, true);
  assert.equal(readiness.dataState, "live");
  assert.deepEqual(readiness.liabilityCap, {
    configured: true,
    maxOutstandingPrepaidCredits: 100000,
    maxOutstandingPrepaidUsd: 100
  });
  assert.equal(readiness.providers.stripe.enabled, true);
  assert.equal(readiness.providers.usdc.enabled, false);
  assert.deepEqual(readiness.blockers, []);
});

test("billing readiness blocks checkout without support and refund links", () => {
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";
  process.env.FISH_STRIPE_SECRET_KEY = "sk_test_configured";
  process.env.FISH_STRIPE_WEBHOOK_SECRET = "whsec_configured";

  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, false);
  assert.equal(readiness.providers.stripe.configured, true);
  assert.equal(readiness.providers.stripe.enabled, false);
  assert.deepEqual(readiness.customerCare, {
    supportConfigured: false,
    refundPolicyConfigured: false,
    supportUrl: null,
    refundPolicyUrl: null
  });
  assert.deepEqual(readiness.blockers, ["billing_support_url_not_configured", "billing_refund_policy_not_configured"]);
});

test("paid topups require support and refund links before payment requests are created", async () => {
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";

  const result = await createUsdcPayment(testAccount(), { amountUsd: 5 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "billing_support_url_not_configured");
  }
});

test("USDC payment creation rejects non-base-mainnet chain config", async () => {
  configureUsdcCheckoutEnv();
  process.env.FISH_USDC_CHAIN_ID = "84532";

  const result = await createUsdcPayment(testAccount(), { amountUsd: 5 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "usdc_checkout_chain_not_base_mainnet");
  }
});

test("USDC payment creation rejects non-canonical token config", async () => {
  configureUsdcCheckoutEnv();
  process.env.FISH_USDC_TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";

  const result = await createUsdcPayment(testAccount(), { amountUsd: 5 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.error, "usdc_checkout_token_not_canonical_base_usdc");
  }
});

test("billing readiness treats placeholder payment secrets as unconfigured", () => {
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "100000";
  process.env.FISH_STRIPE_SECRET_KEY = "change-me-stripe";
  process.env.FISH_STRIPE_WEBHOOK_SECRET = "replace-with-webhook";

  const readiness = summarizeBillingReadiness();

  assert.equal(readiness.checkoutAvailable, false);
  assert.equal(readiness.providers.stripe.configured, false);
  assert.deepEqual(readiness.blockers, ["payment_provider_not_configured", "billing_support_url_not_configured", "billing_refund_policy_not_configured"]);
});

function configureUsdcCheckoutEnv() {
  process.env.FISH_MAX_OUTSTANDING_PREPAID_CREDITS = "1000000000";
  process.env.FISH_BILLING_SUPPORT_URL = "mailto:support@op.fish";
  process.env.FISH_BILLING_REFUND_POLICY_URL = "https://op.fish/refunds";
  process.env.FISH_USDC_RECEIVE_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.FISH_USDC_RPC_URL = "https://base-mainnet.example";
}

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
