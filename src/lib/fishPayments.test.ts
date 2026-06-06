import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseStripeCheckoutRequest, parseUsdcCheckoutRequest } from "./fishPayments";

const originalPublicAppUrl = process.env.FISH_PUBLIC_APP_URL;

afterEach(() => {
  if (originalPublicAppUrl === undefined) {
    delete process.env.FISH_PUBLIC_APP_URL;
  } else {
    process.env.FISH_PUBLIC_APP_URL = originalPublicAppUrl;
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
