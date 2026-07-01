import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { checkRequiredEnv, isPlaceholderSecret, validateEnv, validateEnvAtBoot } from "./env";

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

test("placeholder detection matches by prefix, not exact string", () => {
  assert.equal(isPlaceholderSecret("change-me-for-production"), true);
  assert.equal(isPlaceholderSecret("replace-with-a-long-random-secret"), true);
  // The cloudflare-tunnel template wordings that bypassed the old exact-match set.
  assert.equal(isPlaceholderSecret("replace-with-a-long-random-secret-you-generate"), true);
  assert.equal(isPlaceholderSecret("replace-with-a-different-long-random-secret"), true);
  assert.equal(isPlaceholderSecret("  Change-Me-Anything  "), true);
  assert.equal(isPlaceholderSecret("a-real-long-random-secret"), false);
});

test("secrets copied verbatim from committed env templates are rejected at boot", async () => {
  // Every committed template must yield values that fail production validation,
  // whether empty (missing) or a placeholder string. Guards template/guard drift.
  const templates = [".env.production.example", path.join("deploy", "cloudflare-tunnel", "env.op.fish.local.example")];
  for (const template of templates) {
    const raw = await readFile(path.join(process.cwd(), template), "utf8");
    const values = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const match = /^(FISH_ADMIN_TOKEN|FISH_GUEST_ID_SALT)=(.*)$/.exec(line.trim());
      if (match) {
        values.set(match[1], match[2]);
      }
    }
    assert.ok(values.has("FISH_ADMIN_TOKEN") && values.has("FISH_GUEST_ID_SALT"), `${template} should define both required secrets`);
    const result = checkRequiredEnv({
      NODE_ENV: "production",
      FISH_ADMIN_TOKEN: values.get("FISH_ADMIN_TOKEN"),
      FISH_GUEST_ID_SALT: values.get("FISH_GUEST_ID_SALT")
    } as NodeJS.ProcessEnv);
    assert.equal(result.ok, false, `${template} values must not pass production env validation`);
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
