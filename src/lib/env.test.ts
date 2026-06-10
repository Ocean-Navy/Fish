import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRequiredEnv, validateEnv, validateEnvAtBoot } from "./env";

const VALID_PROD_ENV = {
  NODE_ENV: "production",
  FISH_GUEST_ID_SALT: "a-long-random-guest-salt",
  FISH_ADMIN_TOKEN: "a-long-random-admin-token"
} as NodeJS.ProcessEnv;

test("production env with required secrets passes", () => {
  assert.deepEqual(checkRequiredEnv(VALID_PROD_ENV), { ok: true });
  validateEnv(VALID_PROD_ENV);
});

test("missing required env throws one aggregated error listing everything", () => {
  assert.throws(
    () => validateEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /FISH_GUEST_ID_SALT/);
      assert.match(error.message, /FISH_ADMIN_TOKEN/);
      return true;
    }
  );
});

test("placeholder admin token is rejected", () => {
  const result = checkRequiredEnv({ ...VALID_PROD_ENV, FISH_ADMIN_TOKEN: "change-me-for-production" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.includes("FISH_ADMIN_TOKEN") && issue.includes("placeholder")));
  }
});

test("a half-configured Stripe pair fails; a full pair or none passes", () => {
  const half = checkRequiredEnv({ ...VALID_PROD_ENV, FISH_STRIPE_SECRET_KEY: "sk_live_x" });
  assert.equal(half.ok, false);
  if (!half.ok) {
    assert.ok(half.issues.some((issue) => issue.includes("FISH_STRIPE_WEBHOOK_SECRET")));
  }

  const otherHalf = checkRequiredEnv({ ...VALID_PROD_ENV, FISH_STRIPE_WEBHOOK_SECRET: "whsec_x" });
  assert.equal(otherHalf.ok, false);

  assert.deepEqual(checkRequiredEnv({ ...VALID_PROD_ENV, FISH_STRIPE_SECRET_KEY: "sk_live_x", FISH_STRIPE_WEBHOOK_SECRET: "whsec_x" }), { ok: true });
  assert.deepEqual(checkRequiredEnv(VALID_PROD_ENV), { ok: true });
});

test("boot validation throws on a production server but not in dev or during build", () => {
  const missing = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

  assert.throws(() => validateEnvAtBoot(missing));

  // `next build` prerender phase must never fail on missing secrets (CI builds).
  validateEnvAtBoot({ ...missing, NEXT_PHASE: "phase-production-build" } as NodeJS.ProcessEnv);

  // Development warns instead of throwing.
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    validateEnvAtBoot({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /FISH_GUEST_ID_SALT/);
});
