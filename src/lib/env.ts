import { z } from "zod";

/**
 * Boot-time validation for env that is REQUIRED in production (audit S4).
 *
 * Scope is deliberately narrow: only vars whose absence breaks production
 * safety/correctness are validated. Optional features (warm route, Ocean batch,
 * external fallback, faucet, ...) stay optional — do not add them here.
 *
 * Coordination with CI (WP5): this must never fail `next build`. Builds run with
 * no secrets; validation only throws on a running production server.
 */

const PLACEHOLDER_SECRET_PREFIXES = ["change-me", "replace-with"];

/**
 * True for values copied verbatim from committed env templates. Matched by
 * prefix, not exact string, so new template wordings (e.g.
 * "replace-with-a-long-random-secret-you-generate" in
 * deploy/cloudflare-tunnel/env.op.fish.local.example) cannot silently bypass
 * the guard. Shared with fishLedger.requireAdmin so the boot-time and runtime
 * checks cannot drift apart.
 */
export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_SECRET_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const requiredSecret = (name: string) =>
  z
    .string({ required_error: `${name} is required in production` })
    .trim()
    .min(1, `${name} is required in production`)
    .refine((value) => !isPlaceholderSecret(value), `${name} is still set to a public placeholder value; generate a long random secret`);

const envSchema = z
  .object({
    // Guest routes fail closed (503) in production without it — guestIdentity.ts.
    FISH_GUEST_ID_SALT: requiredSecret("FISH_GUEST_ID_SALT"),
    // Admin routes (credit issuance, settlements) are unusable in production without it — fishLedger.requireAdmin.
    FISH_ADMIN_TOKEN: requiredSecret("FISH_ADMIN_TOKEN"),
    FISH_STRIPE_SECRET_KEY: z.string().trim().optional(),
    FISH_STRIPE_WEBHOOK_SECRET: z.string().trim().optional()
  })
  .superRefine((env, context) => {
    // Stripe billing is enabled by configuring either key; a half-configured pair is
    // the dangerous state (checkout up, webhooks unverifiable — or vice versa).
    const secretKey = Boolean(env.FISH_STRIPE_SECRET_KEY);
    const webhookSecret = Boolean(env.FISH_STRIPE_WEBHOOK_SECRET);
    if (secretKey && !webhookSecret) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FISH_STRIPE_WEBHOOK_SECRET"],
        message: "FISH_STRIPE_WEBHOOK_SECRET is required when FISH_STRIPE_SECRET_KEY is set (billing enabled)"
      });
    }
    if (webhookSecret && !secretKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FISH_STRIPE_SECRET_KEY"],
        message: "FISH_STRIPE_SECRET_KEY is required when FISH_STRIPE_WEBHOOK_SECRET is set (billing enabled)"
      });
    }
  });

export type EnvValidationResult = { ok: true } | { ok: false; issues: string[] };

export function checkRequiredEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const parsed = envSchema.safeParse({
    FISH_GUEST_ID_SALT: env.FISH_GUEST_ID_SALT,
    FISH_ADMIN_TOKEN: env.FISH_ADMIN_TOKEN,
    FISH_STRIPE_SECRET_KEY: emptyToUndefined(env.FISH_STRIPE_SECRET_KEY),
    FISH_STRIPE_WEBHOOK_SECRET: emptyToUndefined(env.FISH_STRIPE_WEBHOOK_SECRET)
  });
  if (parsed.success) {
    return { ok: true };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => issue.message)
  };
}

/**
 * Throws one aggregated, human-readable error listing everything missing.
 * Only meaningful in production; callers decide when to invoke it.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env) {
  const result = checkRequiredEnv(env);
  if (!result.ok) {
    throw new Error(["Fish production env validation failed:", ...result.issues.map((issue) => `  - ${issue}`), "Set the variables above and restart. See .env.production.example."].join("\n"));
  }
}

/**
 * Boot entrypoint (called from instrumentation.ts when the server starts).
 * - production server: throw (fail fast instead of scattered runtime 503s)
 * - `next build` prerender phase: skip — builds must work without secrets (CI)
 * - development/test: warn only
 */
export function validateEnvAtBoot(env: NodeJS.ProcessEnv = process.env) {
  if (env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  if (env.NODE_ENV === "production") {
    validateEnv(env);
    return;
  }
  const result = checkRequiredEnv(env);
  if (!result.ok) {
    console.warn(["Fish env check (dev mode, not fatal) — production would refuse to boot:", ...result.issues.map((issue) => `  - ${issue}`)].join("\n"));
  }
}

function emptyToUndefined(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : undefined;
}
