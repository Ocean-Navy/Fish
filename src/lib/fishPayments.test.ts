import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStripeCheckoutRequest, parseUsdcCheckoutRequest } from "./fishPayments";

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
