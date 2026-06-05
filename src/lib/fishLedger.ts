import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { FISH_DISH_MODELS, fishFeatureIdFromModel } from "@/lib/fishFeaturePolicy";
import { defaultFishPrivacyForRoute, type FishUsagePrivacy } from "@/lib/fishPrivacy";
import type { DataState } from "@/lib/types";

const ROOT = process.cwd();
const LEDGER_DIR = process.env.FISH_LEDGER_DIR ? path.resolve(process.env.FISH_LEDGER_DIR) : path.join(ROOT, "data", "fish");
const ACCOUNTS_PATH = path.join(LEDGER_DIR, "accounts.json");
const CREDIT_ENTRIES_PATH = path.join(LEDGER_DIR, "credit_entries.json");
const RECEIPTS_DIR = path.join(LEDGER_DIR, "receipts");
const LEDGER_LOCK_PATH = path.join(LEDGER_DIR, "accounts.lock");
const LEDGER_LOCK_STALE_MS = 30_000;
const LEDGER_LOCK_RETRY_MS = 10;
export const FISH_CREDIT_USD = 0.001;
const CREDIT_LANES = ["grant", "subscription", "prepaid", "staking", "adjustment", "refund"] as const;
const FISH_PLAN_IDS = ["free", "pro", "team-api", "provider-test"] as const;
const FISH_CHAT_MODEL_ID = "fish-demo-chat";
const FISH_OCEAN_BATCH_MODEL_ID = "ocean-batch-placeholder";
const FISH_DISH_MODEL_IDS = FISH_DISH_MODELS.map((model) => model.id);
const FISH_OCEAN_DEMO_MODEL_IDS = compactIds([process.env.FISH_OCEAN_DEMO_VLLM_MODEL]);
const FISH_OCEAN_PROVIDER_MODEL_IDS = compactIds([process.env.FISH_OCEAN_PROVIDER_MODEL]);
const FISH_EXTERNAL_MODEL_IDS = compactIds([process.env.FISH_EXTERNAL_CHAT_MODEL]);

export const FISH_MODELS = uniqueModels([
  {
    id: FISH_CHAT_MODEL_ID,
    object: "model",
    created: 1780245000,
    owned_by: "ocean-navy",
    description: "Prototype Fish chat route with local credits and usage receipts."
  },
  {
    id: FISH_OCEAN_BATCH_MODEL_ID,
    object: "model",
    created: 1780245000,
    owned_by: "ocean-navy",
    description: "Placeholder for selected Ocean provider batch inference."
  },
  ...FISH_DISH_MODELS,
  ...(FISH_OCEAN_DEMO_MODEL_IDS[0]
    ? [
        {
          id: FISH_OCEAN_DEMO_MODEL_IDS[0],
          object: "model",
          created: 1780245000,
          owned_by: process.env.FISH_OCEAN_DEMO_PROVIDER_ID || "ocean-navy-demo-node",
          description: "Configured Ocean Navy warm vLLM demo route."
        }
      ]
    : []),
  ...(FISH_OCEAN_PROVIDER_MODEL_IDS[0]
    ? [
        {
          id: FISH_OCEAN_PROVIDER_MODEL_IDS[0],
          object: "model",
          created: 1780245000,
          owned_by: process.env.FISH_OCEAN_PROVIDER_ID || "selected-ocean-provider",
          description: "Configured selected Ocean provider warm route."
        }
      ]
    : []),
  ...(FISH_EXTERNAL_MODEL_IDS[0]
    ? [
        {
          id: FISH_EXTERNAL_MODEL_IDS[0],
          object: "model",
          created: 1780245000,
          owned_by: process.env.FISH_EXTERNAL_PROVIDER_ID || "external-compatible",
          description: "Configured external OpenAI-compatible fallback model."
        }
      ]
    : [])
]);

const keyRequestSchema = z.object({
  label: z.string().trim().min(1).max(80).optional().default("Pilot key"),
  creditGrant: z.number().int().min(1).max(100000).optional().default(1000),
  planId: z.enum(FISH_PLAN_IDS).optional().default("free")
});

const keyUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    rotate: z.boolean().optional().default(false)
  })
  .superRefine((update, context) => {
    if (update.label === undefined && !update.rotate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "label or rotate is required"
      });
    }
  });

const creditTopupSchema = z.object({
  accountId: z.string().trim().min(1),
  amount: z.number().int().min(1).max(1000000),
  lane: z.enum(["grant", "subscription", "prepaid", "staking", "adjustment"]).optional().default("prepaid"),
  reason: z.string().trim().min(1).max(140).optional().default("operator_credit_topup"),
  expiresAt: z.string().datetime().nullable().optional().default(null),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
  paymentProviderEventId: z.string().trim().min(1).max(120).optional()
});

const subscriptionActivationSchema = z
  .object({
    accountId: z.string().trim().min(1),
    planId: z.enum(FISH_PLAN_IDS),
    creditGrant: z.number().int().min(0).max(1000000).optional(),
    reason: z.string().trim().min(1).max(140).optional().default("operator_subscription_activation"),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
    paymentProviderEventId: z.string().trim().min(1).max(120).optional(),
    subscriptionRef: z.string().trim().min(1).max(160).optional()
  })
  .superRefine((activation, context) => {
    if (activation.startsAt && activation.expiresAt && Date.parse(activation.startsAt) > Date.parse(activation.expiresAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be after startsAt"
      });
    }
  });

export const chatCompletionSchema = z.object({
  model: z.string().trim().min(1).default("fish-demo-chat"),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool"]).catch("user"),
        content: z.union([z.string(), z.array(z.unknown())]).optional().default("")
      })
    )
    .min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(4096).optional(),
  metadata: z.record(z.unknown()).optional()
});

export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>;

export type Account = {
  id: string;
  label: string;
  keyHash: string;
  createdAt: string;
  rotatedAt?: string | null;
  revokedAt?: string | null;
  planId?: FishPlanId;
  planActivatedAt?: string | null;
  planExpiresAt?: string | null;
  planSource?: "pilot_key" | "operator_subscription" | null;
  creditBalance: number;
  totalCreditsGranted: number;
  totalCreditsSpent: number;
  requestCount: number;
  lastUsedAt: string | null;
};

export type Ledger = {
  accounts: Account[];
};

export type CreditLane = (typeof CREDIT_LANES)[number];
export type CreditEntryKind = "grant" | "debit" | "refund" | "adjustment";
export type FishPlanId = (typeof FISH_PLAN_IDS)[number];

export type FishPlan = {
  planId: FishPlanId;
  label: string;
  state: "prototype" | "future";
  monthlyCreditGrant: number;
  rateLimitPerMinute: number;
  monthlyRequestLimit: number;
  maxStoredThreadItems: number;
  allowedModels: string[];
  externalFallbackAllowed: boolean;
  oceanProviderAllowed: boolean;
};

export type RunnerReceiptSummary = {
  runnerReceiptVersion: number | null;
  jobId: string | null;
  routeId: string | null;
  providerId: string | null;
  runnerId: string | null;
  status: string | null;
  canonicalReceiptHash: string | null;
  computedCanonicalReceiptHash?: string | null;
  signerKeyId: string | null;
  signerAlgorithm?: string | null;
  signatureState: "unsigned" | "verified" | "invalid" | "missing";
  signatureError?: string | null;
};

export const FISH_PLANS: FishPlan[] = [
  {
    planId: "free",
    label: "Free pilot",
    state: "prototype",
    monthlyCreditGrant: 1000,
    rateLimitPerMinute: 12,
    monthlyRequestLimit: 1000,
    maxStoredThreadItems: 20,
    allowedModels: uniqueIds([FISH_CHAT_MODEL_ID, ...FISH_DISH_MODEL_IDS, ...FISH_OCEAN_DEMO_MODEL_IDS]),
    externalFallbackAllowed: false,
    oceanProviderAllowed: false
  },
  {
    planId: "pro",
    label: "Pro harbor",
    state: "future",
    monthlyCreditGrant: 20000,
    rateLimitPerMinute: 60,
    monthlyRequestLimit: 20000,
    maxStoredThreadItems: 200,
    allowedModels: uniqueIds([FISH_CHAT_MODEL_ID, ...FISH_DISH_MODEL_IDS, ...FISH_OCEAN_DEMO_MODEL_IDS, ...FISH_EXTERNAL_MODEL_IDS]),
    externalFallbackAllowed: true,
    oceanProviderAllowed: false
  },
  {
    planId: "team-api",
    label: "Team/API boat",
    state: "future",
    monthlyCreditGrant: 100000,
    rateLimitPerMinute: 180,
    monthlyRequestLimit: 100000,
    maxStoredThreadItems: 1000,
    allowedModels: uniqueIds([FISH_CHAT_MODEL_ID, ...FISH_DISH_MODEL_IDS, ...FISH_OCEAN_DEMO_MODEL_IDS, ...FISH_OCEAN_PROVIDER_MODEL_IDS, ...FISH_EXTERNAL_MODEL_IDS, FISH_OCEAN_BATCH_MODEL_ID]),
    externalFallbackAllowed: true,
    oceanProviderAllowed: true
  },
  {
    planId: "provider-test",
    label: "Provider test",
    state: "prototype",
    monthlyCreditGrant: 5000,
    rateLimitPerMinute: 30,
    monthlyRequestLimit: 5000,
    maxStoredThreadItems: 50,
    allowedModels: uniqueIds([FISH_CHAT_MODEL_ID, ...FISH_DISH_MODEL_IDS, ...FISH_OCEAN_DEMO_MODEL_IDS, ...FISH_OCEAN_PROVIDER_MODEL_IDS, FISH_OCEAN_BATCH_MODEL_ID]),
    externalFallbackAllowed: false,
    oceanProviderAllowed: true
  }
];

type CreditLedger = {
  entries: CreditLedgerEntry[];
};

export type CreditLedgerEntry = {
  entryId: string;
  accountId: string;
  lane: CreditLane;
  kind: CreditEntryKind;
  amount: number;
  requestId: string | null;
  receiptId: string | null;
  expiresAt: string | null;
  createdAt: string;
  operatorReason: string | null;
  idempotencyKey?: string | null;
  paymentProviderEventId?: string | null;
};

export type CreditReservation = {
  requestId: string;
  reserveEntryId: string;
  accountId: string;
  lane: CreditLane;
  credits: number;
  createdAt: string;
};

export type CreditLaneSummary = {
  lane: CreditLane;
  balance: number;
  granted: number;
  spent: number;
  refunds: number;
  adjustments: number;
  entries: number;
  expiresAt: string | null;
};

type UsageReceipt = {
  id: string;
  accountId: string;
  creditEntryId: string | null;
  creditLane: CreditLane;
  createdAt: string;
  model: string;
  feature: string | null;
  route: "mock" | "ocean-demo-vllm" | "ocean-provider" | "external-fallback";
  costState: "prototype_estimate" | "provider_verified" | "fallback_verified";
  status: "succeeded" | "failed";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  creditsSpent: number;
  userChargeUsd: number;
  providerCostUsd: number;
  grossMarginUsd: number;
  providerId: string | null;
  requestHash: string;
  requestedRoute?: "mock" | "ocean-demo-vllm" | "ocean-provider" | "external-fallback" | null;
  fallbackFrom?: "mock" | "ocean-demo-vllm" | "ocean-provider" | "external-fallback" | null;
  fallbackReason?: string | null;
  runnerReceipt?: RunnerReceiptSummary | null;
  errorCode?: string | null;
  privacy?: FishUsagePrivacy;
};

export type FishUsageSummary = {
  dataState: DataState;
  requests: number;
  accounts: number;
  oceanNativeJobs: number;
  externalFallbackJobs: number;
  mockJobs: number;
  runnerProofJobs: number;
  runnerSignedJobs: number;
  runnerVerifiedJobs: number;
  tokensServed: number;
  failedRequests: number;
  averageLatencyMs: number;
  oceanNativeShare: number;
  providerPayoutUsd: number;
  creditsSpent: number;
  creditsRemaining: number;
  userChargeUsd: number;
  providerCostUsd: number;
  grossMarginUsd: number;
  averageProviderCostUsd: number;
  lastReceiptAt: string | null;
  creditLanes: CreditLaneSummary[];
};

export type BillingUsageAnalytics = {
  dataState: DataState;
  generatedAt: string;
  totals: {
    requests: number;
    creditsSpent: number;
    creditsRemaining: number;
    userChargeUsd: number;
    providerCostUsd: number;
    grossMarginUsd: number;
    refunds: number;
    failures: number;
  };
  requestsByDay: Array<{
    date: string;
    requests: number;
    creditsSpent: number;
    userChargeUsd: number;
    providerCostUsd: number;
  }>;
  creditsByLane: CreditLaneSummary[];
  creditsByModel: Array<{
    model: string;
    requests: number;
    creditsSpent: number;
    totalTokens: number;
  }>;
  routeMix: Array<{
    route: UsageReceipt["route"];
    requests: number;
    creditsSpent: number;
    userChargeUsd: number;
    providerCostUsd: number;
  }>;
};

export type FishMonthlyRequestLimitResult =
  | {
      ok: true;
      limit: number;
      used: number;
      remaining: number;
      resetAt: string;
    }
  | {
      ok: false;
      status: 429;
      error: "monthly_request_limit_exceeded";
      limit: number;
      used: number;
      remaining: number;
      resetAt: string;
    };

export function parseKeyRequest(body: unknown) {
  return keyRequestSchema.safeParse(body);
}

export function parseKeyUpdate(body: unknown) {
  return keyUpdateSchema.safeParse(body);
}

export function parseCreditTopup(body: unknown) {
  return creditTopupSchema.safeParse(body);
}

export function parseSubscriptionActivation(body: unknown) {
  return subscriptionActivationSchema.safeParse(body);
}

export function parseChatCompletion(body: unknown) {
  return chatCompletionSchema.safeParse(body);
}

const UNSAFE_ADMIN_TOKENS = new Set(["change-me-for-production"]);

function isUnsafeAdminToken(token: string) {
  return UNSAFE_ADMIN_TOKENS.has(token.trim().toLowerCase());
}

export function requireAdmin(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const adminToken = process.env.FISH_ADMIN_TOKEN?.trim();
  if (!adminToken && process.env.NODE_ENV !== "production") {
    return { ok: true };
  }

  const configuredAdminToken = adminToken && !isUnsafeAdminToken(adminToken) ? adminToken : null;
  const provided = request.headers.get("x-fish-admin-token") || bearerToken(request);
  if (configuredAdminToken && provided === configuredAdminToken) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 401,
    error: "admin_token_required"
  };
}

export async function createApiKey(label: string, creditGrant: number, planId: FishPlanId = "free") {
  const ledger = await readLedger();
  const key = `fish_sk_${randomBytes(24).toString("base64url")}`;
  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(),
    label,
    keyHash: hashSecret(key),
    createdAt: now,
    rotatedAt: null,
    revokedAt: null,
    planId,
    planActivatedAt: now,
    planExpiresAt: null,
    planSource: "pilot_key",
    creditBalance: creditGrant,
    totalCreditsGranted: creditGrant,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null
  };

  ledger.accounts.push(account);
  await writeLedger(ledger);
  await appendCreditEntry({
    entryId: randomUUID(),
    accountId: account.id,
    lane: "grant",
    kind: "grant",
    amount: creditGrant,
    requestId: null,
    receiptId: null,
    expiresAt: null,
    createdAt: now,
    operatorReason: "pilot_key_grant"
  });

  return {
    key,
    account: publicAccount(account)
  };
}

export async function getOrCreateGuestAccount(guestId: string, creditGrant = 25) {
  const ledger = await readLedger();
  const keyHash = hashSecret(`guest:${guestId}`);
  const existing = ledger.accounts.find((candidate) => candidate.keyHash === keyHash);
  if (existing) {
    return {
      ledger,
      account: existing
    };
  }

  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(),
    label: `Guest ${guestId.slice(0, 8)}`,
    keyHash,
    createdAt: now,
    rotatedAt: null,
    revokedAt: null,
    planId: "free",
    planActivatedAt: now,
    planExpiresAt: null,
    planSource: "pilot_key",
    creditBalance: creditGrant,
    totalCreditsGranted: creditGrant,
    totalCreditsSpent: 0,
    requestCount: 0,
    lastUsedAt: null
  };

  ledger.accounts.push(account);
  await writeLedger(ledger);
  await appendCreditEntry({
    entryId: randomUUID(),
    accountId: account.id,
    lane: "grant",
    kind: "grant",
    amount: creditGrant,
    requestId: null,
    receiptId: null,
    expiresAt: null,
    createdAt: now,
    operatorReason: "guest_demo_grant"
  });

  return {
    ledger,
    account
  };
}

export async function authenticateRequest(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false as const,
      status: 401,
      error: "missing_bearer_token"
    };
  }

  const ledger = await readLedger();
  const keyHash = hashSecret(token);
  const account = ledger.accounts.find((candidate) => candidate.keyHash === keyHash);
  if (!account) {
    return {
      ok: false as const,
      status: 401,
      error: "invalid_api_key"
    };
  }
  if (account.revokedAt) {
    return {
      ok: false as const,
      status: 401,
      error: "api_key_revoked"
    };
  }

  return {
    ok: true as const,
    ledger,
    account,
    keyHash
  };
}

export async function revokeApiKey(_ledger: Ledger, account: Account, authenticatedKeyHash = account.keyHash) {
  return withLedgerLock(async () => {
    const ledger = await readLedger();
    const currentAccount = findAccountWithAuthenticatedKey(ledger, account, authenticatedKeyHash);
    if (!currentAccount) {
      return {
        ok: false as const,
        status: 401,
        error: "stale_api_key"
      };
    }
    if (currentAccount.revokedAt) {
      return {
        ok: true as const,
        alreadyRevoked: true,
        account: publicAccount(currentAccount)
      };
    }

    currentAccount.revokedAt = new Date().toISOString();
    await writeLedger(ledger);
    return {
      ok: true as const,
      alreadyRevoked: false,
      account: publicAccount(currentAccount)
    };
  });
}

export async function updateApiKey(_ledger: Ledger, account: Account, input: z.infer<typeof keyUpdateSchema>, authenticatedKeyHash = account.keyHash) {
  return withLedgerLock(async () => {
    const ledger = await readLedger();
    const currentAccount = findCurrentAuthenticatedAccount(ledger, account, authenticatedKeyHash);
    if (!currentAccount) {
      return {
        ok: false as const,
        status: 401,
        error: "stale_api_key"
      };
    }

    const now = new Date().toISOString();
    let key: string | null = null;

    if (input.label !== undefined) {
      currentAccount.label = input.label;
    }

    if (input.rotate) {
      key = `fish_sk_${randomBytes(24).toString("base64url")}`;
      currentAccount.keyHash = hashSecret(key);
      currentAccount.rotatedAt = now;
      currentAccount.revokedAt = null;
    }

    await writeLedger(ledger);
    return {
      ok: true as const,
      rotated: Boolean(input.rotate),
      key,
      account: publicAccount(currentAccount)
    };
  });
}

export async function addFishCredits(params: z.infer<typeof creditTopupSchema>) {
  const ledger = await readLedger();
  const account = ledger.accounts.find((candidate) => candidate.id === params.accountId);
  if (!account) {
    return {
      ok: false as const,
      status: 404,
      error: "fish_account_not_found"
    };
  }

  const now = new Date().toISOString();
  await ensureAccountCreditSeed(account, now);
  const existingEntries = await readCreditEntries(account.id);
  const existingEntry = existingEntries.find((entry) => {
    if (params.idempotencyKey && entry.idempotencyKey === params.idempotencyKey) {
      return true;
    }
    if (params.paymentProviderEventId && entry.paymentProviderEventId === params.paymentProviderEventId) {
      return true;
    }
    return false;
  });

  if (existingEntry) {
    return {
      ok: true as const,
      idempotent: true,
      account: publicAccount(account),
      entry: existingEntry,
      creditsRemaining: account.creditBalance
    };
  }

  const amount = Math.max(1, Math.ceil(params.amount));
  const entry: CreditLedgerEntry = {
    entryId: randomUUID(),
    accountId: account.id,
    lane: params.lane,
    kind: params.lane === "adjustment" ? "adjustment" : "grant",
    amount,
    requestId: null,
    receiptId: null,
    expiresAt: params.expiresAt ?? null,
    createdAt: now,
    operatorReason: params.reason,
    idempotencyKey: params.idempotencyKey ?? null,
    paymentProviderEventId: params.paymentProviderEventId ?? null
  };

  account.creditBalance += amount;
  account.totalCreditsGranted += amount;
  await writeLedger(ledger);
  await appendCreditEntry(entry);

  return {
    ok: true as const,
    idempotent: false,
    account: publicAccount(account),
    entry,
    creditsRemaining: account.creditBalance
  };
}

export async function activateFishSubscription(params: z.infer<typeof subscriptionActivationSchema>) {
  const ledger = await readLedger();
  const account = ledger.accounts.find((candidate) => candidate.id === params.accountId);
  if (!account) {
    return {
      ok: false as const,
      status: 404,
      error: "fish_account_not_found"
    };
  }

  const plan = getFishPlan(params.planId);
  const now = new Date().toISOString();
  const startsAt = params.startsAt ?? now;
  const expiresAt = params.expiresAt === undefined ? addMonths(startsAt, 1) : params.expiresAt;
  const creditGrant = params.creditGrant ?? plan.monthlyCreditGrant;
  await ensureAccountCreditSeed(account, now);
  const existingEntries = await readCreditEntries(account.id);
  const existingEntry = existingEntries.find((entry) => {
    if (params.idempotencyKey && entry.idempotencyKey === params.idempotencyKey) {
      return true;
    }
    if (params.paymentProviderEventId && entry.paymentProviderEventId === params.paymentProviderEventId) {
      return true;
    }
    return false;
  });

  if (existingEntry) {
    return {
      ok: true as const,
      idempotent: true,
      plan,
      account: publicAccount(account),
      entry: existingEntry,
      creditsRemaining: account.creditBalance
    };
  }

  const entry: CreditLedgerEntry = {
    entryId: randomUUID(),
    accountId: account.id,
    lane: "subscription",
    kind: "grant",
    amount: creditGrant,
    requestId: params.subscriptionRef ?? null,
    receiptId: null,
    expiresAt,
    createdAt: now,
    operatorReason: params.reason,
    idempotencyKey: params.idempotencyKey ?? null,
    paymentProviderEventId: params.paymentProviderEventId ?? null
  };

  account.planId = plan.planId;
  account.planActivatedAt = startsAt;
  account.planExpiresAt = expiresAt;
  account.planSource = "operator_subscription";
  account.creditBalance += creditGrant;
  account.totalCreditsGranted += creditGrant;
  await writeLedger(ledger);
  await appendCreditEntry(entry);

  return {
    ok: true as const,
    idempotent: false,
    plan,
    account: publicAccount(account),
    entry,
    creditsRemaining: account.creditBalance
  };
}

export async function summarizeAccount(account: Account) {
  const [receipts, creditEntries, monthlyRequests] = await Promise.all([readReceipts(account.id), readCreditEntries(account.id), checkFishMonthlyRequestLimit(account)]);
  const costs = summarizeReceiptCosts(receipts);
  const creditLanes = summarizeCreditLanes(creditEntries, {
    creditBalance: account.creditBalance,
    totalCreditsGranted: account.totalCreditsGranted,
    totalCreditsSpent: account.totalCreditsSpent
  });
  return {
    account: publicAccount(account),
    receipts: receipts.slice(-20).reverse(),
    creditLanes,
    totals: {
      requests: account.requestCount,
      creditsSpent: account.totalCreditsSpent,
      creditsRemaining: account.creditBalance,
      ...costs
    },
    monthlyRequests
  };
}

export async function summarizeAccountById(accountId: string) {
  const ledger = await readLedger();
  const account = ledger.accounts.find((candidate) => candidate.id === accountId);
  return account ? summarizeAccount(account) : null;
}

export async function reserveFishCredits(params: { ledger: Ledger; account: Account; credits: number; reason: string }) {
  const credits = Math.max(0, Math.ceil(params.credits));
  const now = new Date().toISOString();
  if (credits === 0) {
    await ensureAccountCreditSeed(params.account, now);
    const spendableBalance = await readSpendableCreditBalance(params.account, now);
    return {
      ok: false as const,
      status: 400,
      error: "invalid_credit_reserve",
      needed: 0,
      available: spendableBalance
    };
  }

  return withFishLedgerLock(async () => {
    const ledger = await readLedger();
    const account = ledger.accounts.find((candidate) => candidate.id === params.account.id);
    if (!account || account.revokedAt) {
      return {
        ok: false as const,
        status: 401,
        error: account?.revokedAt ? "api_key_revoked" : "account_not_found",
        needed: credits,
        available: 0
      };
    }

    await ensureAccountCreditSeed(account, now);
    const spendableBalance = await readSpendableCreditBalance(account, now);
    if (spendableBalance < credits) {
      syncLedgerAccountSnapshot(params, ledger, account);
      return {
        ok: false as const,
        status: 402,
        error: "insufficient_fish_credits",
        needed: credits,
        available: spendableBalance
      };
    }

    const lane = await selectSpendLane(account, credits, now);
    const reservation: CreditReservation = {
      requestId: randomUUID(),
      reserveEntryId: randomUUID(),
      accountId: account.id,
      lane,
      credits,
      createdAt: now
    };

    account.creditBalance -= credits;
    syncLedgerAccountSnapshot(params, ledger, account);
    await writeLedger(ledger);
    await appendCreditEntry({
      entryId: reservation.reserveEntryId,
      accountId: account.id,
      lane: reservation.lane,
      kind: "adjustment",
      amount: -credits,
      requestId: reservation.requestId,
      receiptId: null,
      expiresAt: null,
      createdAt: now,
      operatorReason: params.reason
    });

    return {
      ok: true as const,
      reservation
    };
  });
}

export async function releaseFishCreditReservation(params: { ledger: Ledger; account: Account; reservation: CreditReservation; receiptId?: string | null; reason: string }) {
  if (params.reservation.credits <= 0) {
    return;
  }
  await withFishLedgerLock(async () => {
    const now = new Date().toISOString();
    const ledger = await readLedger();
    const account = ledger.accounts.find((candidate) => candidate.id === params.reservation.accountId);
    if (!account) {
      return;
    }
    account.creditBalance += params.reservation.credits;
    syncLedgerAccountSnapshot(params, ledger, account);
    await writeLedger(ledger);
    await appendCreditEntry({
      entryId: randomUUID(),
      accountId: account.id,
      lane: params.reservation.lane,
      kind: "adjustment",
      amount: params.reservation.credits,
      requestId: params.reservation.requestId,
      receiptId: params.receiptId ?? null,
      expiresAt: null,
      createdAt: now,
      operatorReason: params.reason
    });
  });
}

export async function summarizeFishUsage(): Promise<FishUsageSummary> {
  const ledger = await readLedger();
  const [receipts, creditEntries] = await Promise.all([readAllReceipts(), readCreditEntries()]);
  const costs = summarizeReceiptCosts(receipts);
  const dataState: DataState = receipts.length > 0 ? "live" : "sample";
  const oceanNativeJobs = receipts.filter((receipt) => receipt.route === "ocean-provider" || receipt.route === "ocean-demo-vllm").length;
  const externalFallbackJobs = receipts.filter((receipt) => receipt.route === "external-fallback").length;
  const mockJobs = receipts.filter((receipt) => receipt.route === "mock").length;
  const verifiedRunnerReceipts = receipts.filter((receipt) => receipt.runnerReceipt?.signatureState === "verified");
  const runnerProofJobs = verifiedRunnerReceipts.length;
  const runnerSignedJobs = verifiedRunnerReceipts.length;
  const runnerVerifiedJobs = verifiedRunnerReceipts.length;
  const tokensServed = receipts.reduce((sum, receipt) => sum + receipt.totalTokens, 0);
  const failedRequests = receipts.filter((receipt) => receipt.status === "failed").length;
  const latencyValues = receipts.map((receipt) => receipt.latencyMs).filter((latency) => Number.isFinite(latency));
  const averageLatencyMs = latencyValues.length ? latencyValues.reduce((sum, latency) => sum + latency, 0) / latencyValues.length : 0;
  const creditLanes = summarizeCreditLanes(includeLegacyCreditSeeds(ledger.accounts, creditEntries), {
    creditBalance: ledger.accounts.reduce((sum, account) => sum + account.creditBalance, 0),
    totalCreditsGranted: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsGranted, 0),
    totalCreditsSpent: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsSpent, 0)
  });
  return {
    dataState,
    requests: ledger.accounts.reduce((sum, account) => sum + account.requestCount, 0),
    accounts: ledger.accounts.length,
    oceanNativeJobs,
    externalFallbackJobs,
    mockJobs,
    runnerProofJobs,
    runnerSignedJobs,
    runnerVerifiedJobs,
    tokensServed,
    failedRequests,
    averageLatencyMs,
    oceanNativeShare: receipts.length ? oceanNativeJobs / receipts.length : 0,
    providerPayoutUsd: costs.providerCostUsd,
    creditsSpent: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsSpent, 0),
    creditsRemaining: ledger.accounts.reduce((sum, account) => sum + account.creditBalance, 0),
    userChargeUsd: costs.userChargeUsd,
    providerCostUsd: costs.providerCostUsd,
    grossMarginUsd: costs.grossMarginUsd,
    averageProviderCostUsd: receipts.length ? costs.providerCostUsd / receipts.length : 0,
    lastReceiptAt: receipts.at(-1)?.createdAt ?? null,
    creditLanes
  };
}

export async function summarizeBillingUsageAnalytics(): Promise<BillingUsageAnalytics> {
  const ledger = await readLedger();
  const [receipts, creditEntries] = await Promise.all([readAllReceipts(), readCreditEntries()]);
  const creditLanes = summarizeCreditLanes(includeLegacyCreditSeeds(ledger.accounts, creditEntries), {
    creditBalance: ledger.accounts.reduce((sum, account) => sum + account.creditBalance, 0),
    totalCreditsGranted: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsGranted, 0),
    totalCreditsSpent: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsSpent, 0)
  });
  const costs = summarizeReceiptCosts(receipts);
  return {
    dataState: receipts.length > 0 || creditEntries.length > 0 ? "live" : "sample",
    generatedAt: new Date().toISOString(),
    totals: {
      requests: receipts.length,
      creditsSpent: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsSpent, 0),
      creditsRemaining: ledger.accounts.reduce((sum, account) => sum + account.creditBalance, 0),
      ...costs,
      refunds: Math.round(creditEntries.filter((entry) => entry.kind === "refund").reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)),
      failures: 0
    },
    requestsByDay: groupReceiptsByDay(receipts),
    creditsByLane: creditLanes,
    creditsByModel: groupReceiptsByModel(receipts),
    routeMix: groupReceiptsByRoute(receipts)
  };
}

export async function recordChatUsage(params: {
  ledger: Ledger;
  account: Account;
  input: ChatCompletionInput;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  content: string;
  route?: UsageReceipt["route"];
  costState?: UsageReceipt["costState"];
  status?: UsageReceipt["status"];
  latencyMs?: number;
  providerCostUsd?: number;
  providerId?: string | null;
  requestedRoute?: UsageReceipt["route"] | null;
  fallbackFrom?: UsageReceipt["route"] | null;
  fallbackReason?: string | null;
  runnerReceipt?: RunnerReceiptSummary | null;
  reservation?: CreditReservation | null;
  privacy?: FishUsagePrivacy;
  minimumCreditsSpent?: number;
}) {
  const totalTokens = params.promptTokens + params.completionTokens;
  const tokenCreditsSpent = Math.max(1, Math.ceil(totalTokens / 1000));
  const minimumCreditsSpent = Math.max(0, Math.ceil(params.minimumCreditsSpent ?? 0));
  const estimatedCreditsSpent = Math.max(tokenCreditsSpent, minimumCreditsSpent);
  return withFishLedgerLock(async () => {
    const now = new Date().toISOString();
    const ledger = await readLedger();
    const account = ledger.accounts.find((candidate) => candidate.id === params.account.id);
    if (!account || account.revokedAt) {
      return {
        ok: false as const,
        status: 401,
        error: account?.revokedAt ? "api_key_revoked" : "account_not_found",
        needed: estimatedCreditsSpent,
        available: 0
      };
    }

    await ensureAccountCreditSeed(account, now);
    const creditEntries: CreditLedgerEntry[] = [];
    if (params.reservation) {
      account.creditBalance += params.reservation.credits;
      creditEntries.push({
        entryId: randomUUID(),
        accountId: account.id,
        lane: params.reservation.lane,
        kind: "adjustment",
        amount: params.reservation.credits,
        requestId: params.reservation.requestId,
        receiptId: null,
        expiresAt: null,
        createdAt: now,
        operatorReason: "credit_reserve_release_before_debit"
      });
    }

    // A backend that ignores the reserved max-token cap must not turn a paid provider call into
    // a post-call 402 with no debit. Spend the available reserved balance instead.
    const creditsSpent =
      params.reservation && account.creditBalance < estimatedCreditsSpent
        ? Math.max(1, account.creditBalance)
        : estimatedCreditsSpent;

    if (!params.reservation) {
      const spendableBalance = await readSpendableCreditBalance(account, now);
      if (spendableBalance < creditsSpent) {
        syncLedgerAccountSnapshot(params, ledger, account);
        return {
          ok: false as const,
          status: 402,
          error: "insufficient_fish_credits",
          needed: creditsSpent,
          available: spendableBalance
        };
      }
    } else if (account.creditBalance < creditsSpent) {
      syncLedgerAccountSnapshot(params, ledger, account);
      if (creditEntries.length > 0) {
        await writeLedger(ledger);
        await appendCreditEntries(creditEntries);
      }
      return {
        ok: false as const,
        status: 402,
        error: "insufficient_fish_credits",
        needed: estimatedCreditsSpent,
        available: account.creditBalance
      };
    }

    const creditLane = params.reservation?.lane ?? (await selectSpendLane(account, creditsSpent, now));
    const userChargeUsd = Number((creditsSpent * FISH_CREDIT_USD).toFixed(6));
    const providerCostUsd = Number((params.providerCostUsd ?? 0).toFixed(6));
    const grossMarginUsd = Number((userChargeUsd - providerCostUsd).toFixed(6));
    account.creditBalance -= creditsSpent;
    account.totalCreditsSpent += creditsSpent;
    account.requestCount += 1;
    account.lastUsedAt = now;

    const requestId = params.reservation?.requestId ?? randomUUID();
    const receiptId = randomUUID();
    const creditEntryId = randomUUID();
    const receipt: UsageReceipt = {
      id: receiptId,
      accountId: account.id,
      creditEntryId,
      creditLane,
      createdAt: now,
      model: params.model ?? params.input.model,
      feature: readFishFeature(params.input.metadata, params.input.model),
      route: params.route ?? "mock",
      costState: params.costState ?? "prototype_estimate",
      status: params.status ?? "succeeded",
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens,
      latencyMs: Math.max(0, Math.round(params.latencyMs ?? 0)),
      creditsSpent,
      userChargeUsd,
      providerCostUsd,
      grossMarginUsd,
      providerId: params.providerId ?? null,
      requestHash: hashSecret(JSON.stringify(params.input.messages)),
      requestedRoute: params.requestedRoute ?? null,
      fallbackFrom: params.fallbackFrom ?? null,
      fallbackReason: params.fallbackReason ?? null,
      runnerReceipt: params.runnerReceipt ?? null,
      privacy: params.privacy ?? defaultFishPrivacyForRoute(params.route ?? "mock")
    };

    if (params.reservation) {
      creditEntries[creditEntries.length - 1] = {
        ...creditEntries[creditEntries.length - 1],
        receiptId
      };
    }
    creditEntries.push({
      entryId: creditEntryId,
      accountId: account.id,
      lane: creditLane,
      kind: "debit",
      amount: -creditsSpent,
      requestId,
      receiptId,
      expiresAt: null,
      createdAt: now,
      operatorReason: null
    });

    syncLedgerAccountSnapshot(params, ledger, account);
    await writeLedger(ledger);
    await writeReceipt(receipt);
    await appendCreditEntries(creditEntries);

    return {
      ok: true as const,
      receipt,
      creditsRemaining: account.creditBalance
    };
  });
}

export async function recordFailedChatUsage(params: {
  ledger: Ledger;
  account: Account;
  input: ChatCompletionInput;
  model?: string;
  promptTokens: number;
  route?: UsageReceipt["route"];
  costState?: UsageReceipt["costState"];
  latencyMs?: number;
  providerId?: string | null;
  requestedRoute?: UsageReceipt["route"] | null;
  fallbackFrom?: UsageReceipt["route"] | null;
  fallbackReason?: string | null;
  runnerReceipt?: RunnerReceiptSummary | null;
  errorCode?: string | null;
  privacy?: FishUsagePrivacy;
}) {
  return withFishLedgerLock(async () => {
    const now = new Date().toISOString();
    const ledger = await readLedger();
    const account = ledger.accounts.find((candidate) => candidate.id === params.account.id);
    if (!account) {
      return {
        ok: false as const,
        status: 401,
        error: "account_not_found"
      };
    }
    account.requestCount += 1;
    account.lastUsedAt = now;
    const receipt: UsageReceipt = {
      id: randomUUID(),
      accountId: account.id,
      creditEntryId: null,
      creditLane: "adjustment",
      createdAt: now,
      model: params.model ?? params.input.model,
      feature: readFishFeature(params.input.metadata, params.input.model),
      route: params.route ?? "mock",
      costState: params.costState ?? "prototype_estimate",
      status: "failed",
      promptTokens: params.promptTokens,
      completionTokens: 0,
      totalTokens: params.promptTokens,
      latencyMs: Math.max(0, Math.round(params.latencyMs ?? 0)),
      creditsSpent: 0,
      userChargeUsd: 0,
      providerCostUsd: 0,
      grossMarginUsd: 0,
      providerId: params.providerId ?? null,
      requestHash: hashSecret(JSON.stringify(params.input.messages)),
      requestedRoute: params.requestedRoute ?? null,
      fallbackFrom: params.fallbackFrom ?? null,
      fallbackReason: params.fallbackReason ?? null,
      runnerReceipt: params.runnerReceipt ?? null,
      errorCode: params.errorCode ?? null,
      privacy: params.privacy ?? defaultFishPrivacyForRoute(params.route ?? "mock")
    };

    syncLedgerAccountSnapshot(params, ledger, account);
    await writeLedger(ledger);
    await writeReceipt(receipt);
    return {
      ok: true as const,
      receipt
    };
  });
}

export async function checkFishMonthlyRequestLimit(account: Account, limit?: number, now = new Date()): Promise<FishMonthlyRequestLimitResult> {
  const safeLimit = Math.max(0, Math.floor(limit ?? getActiveFishPlan(account, now).monthlyRequestLimit));
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const used = await countMonthlySucceededReceipts(account.id, periodStart, nextPeriodStart, safeLimit);
  const remaining = Math.max(0, safeLimit - used);
  if (used >= safeLimit) {
    return {
      ok: false,
      status: 429,
      error: "monthly_request_limit_exceeded",
      limit: safeLimit,
      used,
      remaining,
      resetAt: nextPeriodStart.toISOString()
    };
  }

  return {
    ok: true,
    limit: safeLimit,
    used,
    remaining,
    resetAt: nextPeriodStart.toISOString()
  };
}

function readFishFeature(metadata: Record<string, unknown> | undefined, model: string | undefined) {
  const feature = metadata?.fish_feature;
  if (typeof feature === "string" && feature.trim()) {
    return feature.trim().slice(0, 80);
  }
  return fishFeatureIdFromModel(model);
}

export function buildMockCompletion(input: ChatCompletionInput) {
  const lastUserMessage = [...input.messages]
    .reverse()
    .find((message) => message.role === "user" && typeof message.content === "string");
  const ask = typeof lastUserMessage?.content === "string" ? lastUserMessage.content.trim() : "";
  const shortAsk = ask.length > 180 ? `${ask.slice(0, 180)}...` : ask || "your request";

  return [
    "Fish prototype response:",
    `I would route \"${shortAsk}\" through the Fish market, meter the request in credits, and later send it to an approved Ocean provider.`,
    "For now this endpoint proves the app/API shape, API-key auth, credit debit, and usage receipts."
  ].join(" ");
}

export function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function addMonths(value: string, months: number) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

export async function sumProviderCostForRouteSince(route: UsageReceipt["route"], sinceIso: string) {
  const receipts = await readAllReceipts();
  return Number(receipts.filter((receipt) => receipt.route === route && receipt.createdAt >= sinceIso).reduce((sum, receipt) => sum + receipt.providerCostUsd, 0).toFixed(6));
}

async function withFishLedgerLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(LEDGER_DIR, { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  while (!handle) {
    try {
      handle = await open(LEDGER_LOCK_PATH, "wx");
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString()
        })
      );
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
      await removeStaleLedgerLock();
      await sleep(LEDGER_LOCK_RETRY_MS);
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await rm(LEDGER_LOCK_PATH, { force: true }).catch(() => undefined);
  }
}

async function removeStaleLedgerLock() {
  let createdAt = 0;
  try {
    const raw = await readFile(LEDGER_LOCK_PATH, "utf8");
    const parsed = JSON.parse(raw) as { createdAt?: unknown };
    createdAt = typeof parsed.createdAt === "string" ? Date.parse(parsed.createdAt) : 0;
  } catch {
    const lockStat = await stat(LEDGER_LOCK_PATH).catch(() => null);
    createdAt = lockStat?.mtimeMs ?? 0;
  }

  if (createdAt > 0 && Date.now() - createdAt > LEDGER_LOCK_STALE_MS) {
    await rm(LEDGER_LOCK_PATH, { force: true });
  }
}

function isFileExistsError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}

let ledgerLock = Promise.resolve();

async function withLedgerLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = ledgerLock;
  let releaseCurrent!: () => void;
  ledgerLock = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    releaseCurrent();
  }
}

function findAccountWithAuthenticatedKey(ledger: Ledger, authenticatedAccount: Account, authenticatedKeyHash: string) {
  const currentAccount = ledger.accounts.find((candidate) => candidate.id === authenticatedAccount.id);
  if (!currentAccount || currentAccount.keyHash !== authenticatedKeyHash) {
    return null;
  }
  return currentAccount;
}

function findCurrentAuthenticatedAccount(ledger: Ledger, authenticatedAccount: Account, authenticatedKeyHash: string) {
  const currentAccount = findAccountWithAuthenticatedKey(ledger, authenticatedAccount, authenticatedKeyHash);
  if (!currentAccount || currentAccount.revokedAt) {
    return null;
  }
  return currentAccount;
}

async function readLedger(): Promise<Ledger> {
  try {
    const raw = await readFile(ACCOUNTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Ledger;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
    };
  } catch {
    return { accounts: [] };
  }
}

let ledgerWriteQueue = Promise.resolve();

async function withLedgerMutation<T>(mutation: (ledger: Ledger) => Promise<T>): Promise<T> {
  const run = ledgerWriteQueue.then(async () => {
    const ledger = await readLedger();
    const result = await mutation(ledger);
    await mkdir(LEDGER_DIR, { recursive: true });
    await writeFile(ACCOUNTS_PATH, JSON.stringify(ledger, null, 2));
    return result;
  });
  ledgerWriteQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function syncLedgerAccountSnapshot(params: { ledger: Ledger; account: Account }, latestLedger: Ledger, latestAccount: Account) {
  params.ledger.accounts = latestLedger.accounts;
  Object.assign(params.account, latestAccount);
}

async function writeLedger(ledger: Ledger) {
  const write = ledgerWriteQueue.then(async () => {
    const currentLedger = await readLedger();
    const currentAccountsById = new Map(currentLedger.accounts.map((account) => [account.id, account]));
    const mergedLedger: Ledger = {
      accounts: ledger.accounts.map((account) => preserveCurrentRevocation(account, currentAccountsById.get(account.id)))
    };

    await mkdir(LEDGER_DIR, { recursive: true });
    await writeFile(ACCOUNTS_PATH, JSON.stringify(mergedLedger, null, 2));
  });
  ledgerWriteQueue = write.catch(() => undefined);
  await write;
}

function preserveCurrentRevocation(account: Account, currentAccount?: Account): Account {
  if (!currentAccount?.revokedAt) {
    return account;
  }

  if (account.revokedAt && Date.parse(account.revokedAt) >= Date.parse(currentAccount.revokedAt)) {
    return account;
  }

  account.revokedAt = currentAccount.revokedAt;
  return account;
}

async function readCreditLedger(): Promise<CreditLedger> {
  try {
    const raw = await readFile(CREDIT_ENTRIES_PATH, "utf8");
    const parsed = JSON.parse(raw) as CreditLedger;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isCreditEntry) : []
    };
  } catch {
    return { entries: [] };
  }
}

async function writeCreditLedger(ledger: CreditLedger) {
  await mkdir(LEDGER_DIR, { recursive: true });
  await writeFile(CREDIT_ENTRIES_PATH, JSON.stringify(ledger, null, 2));
}

async function readCreditEntries(accountId?: string): Promise<CreditLedgerEntry[]> {
  const ledger = await readCreditLedger();
  const entries = accountId ? ledger.entries.filter((entry) => entry.accountId === accountId) : ledger.entries;
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function appendCreditEntry(entry: CreditLedgerEntry) {
  await appendCreditEntries([entry]);
}

async function appendCreditEntries(entries: CreditLedgerEntry[]) {
  if (entries.length === 0) {
    return;
  }
  const ledger = await readCreditLedger();
  ledger.entries.push(...entries);
  await writeCreditLedger(ledger);
}

async function ensureAccountCreditSeed(account: Account, createdAt: string) {
  const existing = await readCreditEntries(account.id);
  if (existing.length > 0) {
    return;
  }

  const seeded: CreditLedgerEntry[] = [
    {
      entryId: randomUUID(),
      accountId: account.id,
      lane: "grant",
      kind: "grant",
      amount: account.totalCreditsGranted,
      requestId: null,
      receiptId: null,
      expiresAt: null,
      createdAt,
      operatorReason: "legacy_account_seed"
    }
  ];

  if (account.totalCreditsSpent > 0) {
    seeded.push({
      entryId: randomUUID(),
      accountId: account.id,
      lane: "grant",
      kind: "debit",
      amount: -account.totalCreditsSpent,
      requestId: null,
      receiptId: null,
      expiresAt: null,
      createdAt,
      operatorReason: "legacy_spend_seed"
    });
  }

  const ledger = await readCreditLedger();
  ledger.entries.push(...seeded);
  await writeCreditLedger(ledger);
}

async function readSpendableCreditBalance(account: Account, now: string) {
  const entries = await readCreditEntries(account.id);
  return sumCreditLaneBalances(calculateSpendableCreditLaneBalances(entries, now));
}

async function selectSpendLane(account: Account, credits: number, now = new Date().toISOString()): Promise<CreditLane> {
  const entries = await readCreditEntries(account.id);
  const laneBalances = calculateSpendableCreditLaneBalances(entries, now);

  const spendPriority: CreditLane[] = ["grant", "subscription", "prepaid", "staking", "adjustment", "refund"];
  for (const lane of spendPriority) {
    if ((laneBalances.get(lane) ?? 0) >= credits) {
      return lane;
    }
  }

  return spendPriority.find((lane) => (laneBalances.get(lane) ?? 0) > 0) ?? "grant";
}

export function summarizeSpendableCreditLaneBalances(entries: CreditLedgerEntry[], nowIso = new Date().toISOString()) {
  const laneBalances = new Map<CreditLane, number>();
  for (const entry of entries) {
    if (entry.amount > 0 && isExpiredAt(entry.expiresAt, nowIso)) {
      continue;
    }
    laneBalances.set(entry.lane, (laneBalances.get(entry.lane) ?? 0) + entry.amount);
  }
  return laneBalances;
}

type CreditLot = {
  amount: number;
  expiresAt: string | null;
};

function calculateSpendableCreditLaneBalances(entries: CreditLedgerEntry[], now: string) {
  const lotsByLane = new Map<CreditLane, CreditLot[]>();
  for (const entry of entries) {
    const lots = lotsByLane.get(entry.lane) ?? [];
    if (entry.amount > 0) {
      lots.push({ amount: entry.amount, expiresAt: entry.expiresAt });
      lotsByLane.set(entry.lane, lots);
      continue;
    }

    let debitRemaining = Math.abs(entry.amount);
    for (const lot of lots.sort(compareCreditLotsForSpend)) {
      if (debitRemaining <= 0) {
        break;
      }
      const debit = Math.min(lot.amount, debitRemaining);
      lot.amount -= debit;
      debitRemaining -= debit;
    }
  }

  const balances = new Map<CreditLane, number>();
  for (const [lane, lots] of lotsByLane) {
    const balance = lots.reduce((sum, lot) => sum + (isCreditLotSpendable(lot, now) ? lot.amount : 0), 0);
    balances.set(lane, Math.max(0, Math.round(balance)));
  }
  return balances;
}

function compareCreditLotsForSpend(left: CreditLot, right: CreditLot) {
  if (left.expiresAt && right.expiresAt && left.expiresAt !== right.expiresAt) {
    return left.expiresAt.localeCompare(right.expiresAt);
  }
  if (left.expiresAt && !right.expiresAt) {
    return -1;
  }
  if (!left.expiresAt && right.expiresAt) {
    return 1;
  }
  return 0;
}

function isCreditLotSpendable(lot: CreditLot, now: string) {
  return lot.amount > 0 && (!lot.expiresAt || lot.expiresAt > now);
}

function sumCreditLaneBalances(laneBalances: Map<CreditLane, number>) {
  return [...laneBalances.values()].reduce((sum, balance) => sum + Math.max(0, balance), 0);
}

async function writeReceipt(receipt: UsageReceipt) {
  await mkdir(RECEIPTS_DIR, { recursive: true });
  await writeFile(path.join(RECEIPTS_DIR, `${receipt.createdAt}-${receipt.id}.json`.replaceAll(":", "-")), JSON.stringify(receipt, null, 2));
}

async function readReceipts(accountId: string): Promise<UsageReceipt[]> {
  const receipts = await readAllReceipts();
  return receipts.filter((receipt) => receipt.accountId === accountId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function readAllReceipts(): Promise<UsageReceipt[]> {
  try {
    const files = await readdir(RECEIPTS_DIR);
    const receipts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(RECEIPTS_DIR, file), "utf8");
          return JSON.parse(raw) as UsageReceipt;
        })
    );
    return receipts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

async function countMonthlySucceededReceipts(accountId: string, periodStart: Date, nextPeriodStart: Date, stopAt = Number.POSITIVE_INFINITY): Promise<number> {
  if (stopAt <= 0) {
    return 0;
  }

  const periodStartMs = periodStart.getTime();
  const nextPeriodStartMs = nextPeriodStart.getTime();
  const periodFilePrefix = periodStart.toISOString().slice(0, 7);
  let used = 0;

  try {
    const files = await readdir(RECEIPTS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json") || !file.startsWith(periodFilePrefix)) {
        continue;
      }

      const receipt = await readReceiptFile(file);
      if (!receipt || receipt.accountId !== accountId || receipt.status !== "succeeded") {
        continue;
      }

      const createdAt = new Date(receipt.createdAt).getTime();
      if (createdAt >= periodStartMs && createdAt < nextPeriodStartMs) {
        used += 1;
        if (used >= stopAt) {
          return used;
        }
      }
    }
  } catch {
    return used;
  }

  return used;
}

async function readReceiptFile(file: string): Promise<UsageReceipt | null> {
  try {
    const raw = await readFile(path.join(RECEIPTS_DIR, file), "utf8");
    return JSON.parse(raw) as UsageReceipt;
  } catch {
    return null;
  }
}

function summarizeReceiptCosts(receipts: UsageReceipt[]) {
  return {
    userChargeUsd: sumReceiptNumber(receipts, "userChargeUsd"),
    providerCostUsd: sumReceiptNumber(receipts, "providerCostUsd"),
    grossMarginUsd: sumReceiptNumber(receipts, "grossMarginUsd")
  };
}

function groupReceiptsByDay(receipts: UsageReceipt[]) {
  const days = new Map<string, { date: string; requests: number; creditsSpent: number; userChargeUsd: number; providerCostUsd: number }>();
  for (const receipt of receipts) {
    const date = receipt.createdAt.slice(0, 10);
    const row = days.get(date) ?? { date, requests: 0, creditsSpent: 0, userChargeUsd: 0, providerCostUsd: 0 };
    row.requests += 1;
    row.creditsSpent += receipt.creditsSpent;
    row.userChargeUsd += receipt.userChargeUsd;
    row.providerCostUsd += receipt.providerCostUsd;
    days.set(date, row);
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      userChargeUsd: Number(row.userChargeUsd.toFixed(6)),
      providerCostUsd: Number(row.providerCostUsd.toFixed(6))
    }));
}

function groupReceiptsByModel(receipts: UsageReceipt[]) {
  const models = new Map<string, { model: string; requests: number; creditsSpent: number; totalTokens: number }>();
  for (const receipt of receipts) {
    const row = models.get(receipt.model) ?? { model: receipt.model, requests: 0, creditsSpent: 0, totalTokens: 0 };
    row.requests += 1;
    row.creditsSpent += receipt.creditsSpent;
    row.totalTokens += receipt.totalTokens;
    models.set(receipt.model, row);
  }
  return [...models.values()].sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model));
}

function groupReceiptsByRoute(receipts: UsageReceipt[]) {
  const routes = new Map<UsageReceipt["route"], { route: UsageReceipt["route"]; requests: number; creditsSpent: number; userChargeUsd: number; providerCostUsd: number }>();
  for (const receipt of receipts) {
    const row = routes.get(receipt.route) ?? { route: receipt.route, requests: 0, creditsSpent: 0, userChargeUsd: 0, providerCostUsd: 0 };
    row.requests += 1;
    row.creditsSpent += receipt.creditsSpent;
    row.userChargeUsd += receipt.userChargeUsd;
    row.providerCostUsd += receipt.providerCostUsd;
    routes.set(receipt.route, row);
  }
  return [...routes.values()]
    .sort((a, b) => b.requests - a.requests || a.route.localeCompare(b.route))
    .map((row) => ({
      ...row,
      userChargeUsd: Number(row.userChargeUsd.toFixed(6)),
      providerCostUsd: Number(row.providerCostUsd.toFixed(6))
    }));
}

function summarizeCreditLanes(
  entries: CreditLedgerEntry[],
  fallback: { creditBalance: number; totalCreditsGranted: number; totalCreditsSpent: number }
): CreditLaneSummary[] {
  if (entries.length === 0 && (fallback.creditBalance > 0 || fallback.totalCreditsGranted > 0 || fallback.totalCreditsSpent > 0)) {
    return [
      {
        lane: "grant",
        balance: fallback.creditBalance,
        granted: fallback.totalCreditsGranted,
        spent: fallback.totalCreditsSpent,
        refunds: 0,
        adjustments: 0,
        entries: Number(fallback.totalCreditsGranted > 0) + Number(fallback.totalCreditsSpent > 0),
        expiresAt: null
      }
    ];
  }

  const summaries = new Map<CreditLane, CreditLaneSummary>(
    CREDIT_LANES.map((lane) => [
      lane,
      {
        lane,
        balance: 0,
        granted: 0,
        spent: 0,
        refunds: 0,
        adjustments: 0,
        entries: 0,
        expiresAt: null
      }
    ])
  );

  for (const entry of entries) {
    const summary = summaries.get(entry.lane);
    if (!summary) {
      continue;
    }
    summary.balance += entry.amount;
    summary.entries += 1;
    if (entry.kind === "grant") {
      summary.granted += Math.max(0, entry.amount);
    }
    if (entry.kind === "debit") {
      summary.spent += Math.abs(Math.min(0, entry.amount));
    }
    if (entry.kind === "refund") {
      summary.refunds += Math.max(0, entry.amount);
    }
    if (entry.kind === "adjustment") {
      summary.adjustments += entry.amount;
    }
    if (entry.expiresAt && (!summary.expiresAt || entry.expiresAt < summary.expiresAt)) {
      summary.expiresAt = entry.expiresAt;
    }
  }

  return [...summaries.values()]
    .filter((summary) => summary.entries > 0 || summary.balance !== 0)
    .map((summary) => ({
      ...summary,
      balance: Math.round(summary.balance),
      granted: Math.round(summary.granted),
      spent: Math.round(summary.spent),
      refunds: Math.round(summary.refunds),
      adjustments: Math.round(summary.adjustments)
    }));
}

function includeLegacyCreditSeeds(accounts: Account[], entries: CreditLedgerEntry[]) {
  const accountIdsWithEntries = new Set(entries.map((entry) => entry.accountId));
  const legacyEntries = accounts.flatMap((account): CreditLedgerEntry[] => {
    if (accountIdsWithEntries.has(account.id)) {
      return [];
    }
    const createdAt = account.createdAt;
    return [
      {
        entryId: `legacy-grant-${account.id}`,
        accountId: account.id,
        lane: "grant",
        kind: "grant",
        amount: account.totalCreditsGranted,
        requestId: null,
        receiptId: null,
        expiresAt: null,
        createdAt,
        operatorReason: "legacy_account_summary"
      },
      ...(account.totalCreditsSpent > 0
        ? [
            {
              entryId: `legacy-spent-${account.id}`,
              accountId: account.id,
              lane: "grant" as const,
              kind: "debit" as const,
              amount: -account.totalCreditsSpent,
              requestId: null,
              receiptId: null,
              expiresAt: null,
              createdAt,
              operatorReason: "legacy_spend_summary"
            }
          ]
        : [])
    ];
  });
  return [...entries, ...legacyEntries];
}

function sumReceiptNumber(receipts: UsageReceipt[], key: "userChargeUsd" | "providerCostUsd" | "grossMarginUsd") {
  return Number(receipts.reduce((sum, receipt) => sum + (Number.isFinite(receipt[key]) ? receipt[key] : 0), 0).toFixed(6));
}

function publicAccount(account: Account) {
  const plan = getActiveFishPlan(account);
  return {
    id: account.id,
    label: account.label,
    createdAt: account.createdAt,
    rotatedAt: account.rotatedAt ?? null,
    planId: plan.planId,
    planActivatedAt: account.planActivatedAt ?? account.createdAt,
    planExpiresAt: account.planExpiresAt ?? null,
    planSource: account.planSource ?? "pilot_key",
    plan,
    status: account.revokedAt ? "revoked" : "active",
    revokedAt: account.revokedAt ?? null,
    creditBalance: account.creditBalance,
    totalCreditsGranted: account.totalCreditsGranted,
    totalCreditsSpent: account.totalCreditsSpent,
    requestCount: account.requestCount,
    lastUsedAt: account.lastUsedAt
  };
}

export function getFishPlan(planId: string | undefined | null) {
  return FISH_PLANS.find((plan) => plan.planId === planId) ?? FISH_PLANS[0];
}

export function getActiveFishPlan(account: Account, now = new Date()) {
  if (isExpiredOperatorSubscription(account, now.toISOString())) {
    return getFishPlan("free");
  }
  return getFishPlan(account.planId);
}

export function checkFishModelAccess(model: string, planIdOrAccount: string | Account | undefined | null, now = new Date()) {
  const modelId = model.trim() || FISH_CHAT_MODEL_ID;
  const plan = typeof planIdOrAccount === "object" && planIdOrAccount ? getActiveFishPlan(planIdOrAccount, now) : getFishPlan(planIdOrAccount);
  const availableModels = FISH_MODELS.map((candidate) => candidate.id);
  if (!availableModels.includes(modelId)) {
    return {
      ok: false as const,
      status: 400,
      error: "fish_model_not_found",
      model: modelId,
      plan,
      availableModels
    };
  }
  if (!plan.allowedModels.includes(modelId)) {
    return {
      ok: false as const,
      status: 403,
      error: "fish_model_not_allowed_for_plan",
      model: modelId,
      plan,
      allowedModels: plan.allowedModels
    };
  }
  return {
    ok: true as const,
    model: modelId,
    plan
  };
}

function isExpiredOperatorSubscription(account: Account, nowIso: string) {
  return account.planSource === "operator_subscription" && isExpiredAt(account.planExpiresAt, nowIso);
}

function isExpiredAt(expiresAt: string | null | undefined, nowIso: string) {
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.parse(nowIso));
}

function compactIds(values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values));
}

function uniqueModels<T extends { id: string }>(models: T[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) {
      return false;
    }
    seen.add(model.id);
    return true;
  });
}

function isCreditEntry(entry: unknown): entry is CreditLedgerEntry {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const candidate = entry as CreditLedgerEntry;
  return (
    typeof candidate.entryId === "string" &&
    typeof candidate.accountId === "string" &&
    CREDIT_LANES.includes(candidate.lane) &&
    ["grant", "debit", "refund", "adjustment"].includes(candidate.kind) &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    typeof candidate.createdAt === "string"
  );
}
