import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { DataState } from "@/lib/types";

const ROOT = process.cwd();
const LEDGER_DIR = path.join(ROOT, "data", "fish");
const ACCOUNTS_PATH = path.join(LEDGER_DIR, "accounts.json");
const CREDIT_ENTRIES_PATH = path.join(LEDGER_DIR, "credit_entries.json");
const RECEIPTS_DIR = path.join(LEDGER_DIR, "receipts");
const FISH_CREDIT_USD = 0.001;
const CREDIT_LANES = ["grant", "subscription", "prepaid", "staking", "adjustment", "refund"] as const;
const FISH_PLAN_IDS = ["free", "pro", "team-api", "provider-test"] as const;

export const FISH_MODELS = [
  {
    id: "fish-demo-chat",
    object: "model",
    created: 1780245000,
    owned_by: "ocean-navy",
    description: "Prototype Fish chat route with local credits and usage receipts."
  },
  {
    id: "ocean-batch-placeholder",
    object: "model",
    created: 1780245000,
    owned_by: "ocean-navy",
    description: "Placeholder for selected Ocean provider batch inference."
  },
  ...(process.env.FISH_OCEAN_DEMO_VLLM_MODEL
    ? [
        {
          id: process.env.FISH_OCEAN_DEMO_VLLM_MODEL,
          object: "model",
          created: 1780245000,
          owned_by: process.env.FISH_OCEAN_DEMO_PROVIDER_ID || "ocean-navy-demo-node",
          description: "Configured Ocean Navy warm vLLM demo route."
        }
      ]
    : []),
  ...(process.env.FISH_EXTERNAL_CHAT_MODEL
    ? [
        {
          id: process.env.FISH_EXTERNAL_CHAT_MODEL,
          object: "model",
          created: 1780245000,
          owned_by: process.env.FISH_EXTERNAL_PROVIDER_ID || "external-compatible",
          description: "Configured external OpenAI-compatible fallback model."
        }
      ]
    : [])
];

const keyRequestSchema = z.object({
  label: z.string().trim().min(1).max(80).optional().default("Pilot key"),
  creditGrant: z.number().int().min(1).max(100000).optional().default(1000),
  planId: z.enum(FISH_PLAN_IDS).optional().default("free")
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
  planId?: FishPlanId;
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
  signerKeyId: string | null;
  signatureState: "signed" | "unsigned";
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
    allowedModels: ["fish-demo-chat"],
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
    allowedModels: ["fish-demo-chat", "external-compatible"],
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
    allowedModels: ["fish-demo-chat", "external-compatible", "selected-ocean-provider"],
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
    allowedModels: ["fish-demo-chat", "ocean-batch-placeholder"],
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
  tokensServed: number;
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

export function parseKeyRequest(body: unknown) {
  return keyRequestSchema.safeParse(body);
}

export function parseChatCompletion(body: unknown) {
  return chatCompletionSchema.safeParse(body);
}

export function requireAdmin(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const adminToken = process.env.FISH_ADMIN_TOKEN;
  if (!adminToken && process.env.NODE_ENV !== "production") {
    return { ok: true };
  }

  const provided = request.headers.get("x-fish-admin-token") || bearerToken(request);
  if (adminToken && provided === adminToken) {
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
    planId,
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
    planId: "free",
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

  return {
    ok: true as const,
    ledger,
    account
  };
}

export async function summarizeAccount(account: Account) {
  const [receipts, creditEntries] = await Promise.all([readReceipts(account.id), readCreditEntries(account.id)]);
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
    }
  };
}

export async function summarizeAccountById(accountId: string) {
  const ledger = await readLedger();
  const account = ledger.accounts.find((candidate) => candidate.id === accountId);
  return account ? summarizeAccount(account) : null;
}

export async function reserveFishCredits(params: { ledger: Ledger; account: Account; credits: number; reason: string }) {
  const credits = Math.max(0, Math.ceil(params.credits));
  if (credits === 0) {
    return {
      ok: false as const,
      status: 400,
      error: "invalid_credit_reserve",
      needed: 0,
      available: params.account.creditBalance
    };
  }
  if (params.account.creditBalance < credits) {
    return {
      ok: false as const,
      status: 402,
      error: "insufficient_fish_credits",
      needed: credits,
      available: params.account.creditBalance
    };
  }

  const now = new Date().toISOString();
  const reservation: CreditReservation = {
    requestId: randomUUID(),
    reserveEntryId: randomUUID(),
    accountId: params.account.id,
    lane: "grant",
    credits,
    createdAt: now
  };

  await ensureAccountCreditSeed(params.account, now);
  params.account.creditBalance -= credits;
  await writeLedger(params.ledger);
  await appendCreditEntry({
    entryId: reservation.reserveEntryId,
    accountId: params.account.id,
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
}

export async function releaseFishCreditReservation(params: { ledger: Ledger; account: Account; reservation: CreditReservation; receiptId?: string | null; reason: string }) {
  if (params.reservation.credits <= 0) {
    return;
  }
  const now = new Date().toISOString();
  params.account.creditBalance += params.reservation.credits;
  await writeLedger(params.ledger);
  await appendCreditEntry({
    entryId: randomUUID(),
    accountId: params.account.id,
    lane: params.reservation.lane,
    kind: "adjustment",
    amount: params.reservation.credits,
    requestId: params.reservation.requestId,
    receiptId: params.receiptId ?? null,
    expiresAt: null,
    createdAt: now,
    operatorReason: params.reason
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
  const runnerProofJobs = receipts.filter((receipt) => receipt.runnerReceipt?.canonicalReceiptHash).length;
  const runnerSignedJobs = receipts.filter((receipt) => receipt.runnerReceipt?.signatureState === "signed").length;
  const tokensServed = receipts.reduce((sum, receipt) => sum + receipt.totalTokens, 0);
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
    tokensServed,
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
}) {
  const totalTokens = params.promptTokens + params.completionTokens;
  const creditsSpent = Math.max(1, Math.ceil(totalTokens / 1000));
  if (params.reservation) {
    await releaseFishCreditReservation({
      ledger: params.ledger,
      account: params.account,
      reservation: params.reservation,
      receiptId: null,
      reason: "credit_reserve_release_before_debit"
    });
  }
  if (params.account.creditBalance < creditsSpent) {
    return {
      ok: false as const,
      status: 402,
      error: "insufficient_fish_credits",
      needed: creditsSpent,
      available: params.account.creditBalance
    };
  }

  const now = new Date().toISOString();
  await ensureAccountCreditSeed(params.account, now);
  const userChargeUsd = Number((creditsSpent * FISH_CREDIT_USD).toFixed(6));
  const providerCostUsd = Number((params.providerCostUsd ?? 0).toFixed(6));
  const grossMarginUsd = Number((userChargeUsd - providerCostUsd).toFixed(6));
  params.account.creditBalance -= creditsSpent;
  params.account.totalCreditsSpent += creditsSpent;
  params.account.requestCount += 1;
  params.account.lastUsedAt = now;

  const requestId = params.reservation?.requestId ?? randomUUID();
  const receiptId = randomUUID();
  const creditEntryId = randomUUID();
  const receipt: UsageReceipt = {
    id: receiptId,
    accountId: params.account.id,
    creditEntryId,
    creditLane: "grant",
    createdAt: now,
    model: params.model ?? params.input.model,
    feature: readFishFeature(params.input.metadata),
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
    runnerReceipt: params.runnerReceipt ?? null
  };

  await writeLedger(params.ledger);
  await writeReceipt(receipt);
  await appendCreditEntry({
    entryId: creditEntryId,
    accountId: params.account.id,
    lane: "grant",
    kind: "debit",
    amount: -creditsSpent,
    requestId,
    receiptId,
    expiresAt: null,
    createdAt: now,
    operatorReason: null
  });

  return {
    ok: true as const,
    receipt,
    creditsRemaining: params.account.creditBalance
  };
}

function readFishFeature(metadata: Record<string, unknown> | undefined) {
  const feature = metadata?.fish_feature;
  return typeof feature === "string" && feature.trim() ? feature.trim().slice(0, 80) : null;
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

export async function sumProviderCostForRouteSince(route: UsageReceipt["route"], sinceIso: string) {
  const receipts = await readAllReceipts();
  return Number(receipts.filter((receipt) => receipt.route === route && receipt.createdAt >= sinceIso).reduce((sum, receipt) => sum + receipt.providerCostUsd, 0).toFixed(6));
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

async function writeLedger(ledger: Ledger) {
  await mkdir(LEDGER_DIR, { recursive: true });
  await writeFile(ACCOUNTS_PATH, JSON.stringify(ledger, null, 2));
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
  const ledger = await readCreditLedger();
  ledger.entries.push(entry);
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
    const { readdir } = await import("node:fs/promises");
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
  const plan = getFishPlan(account.planId);
  return {
    id: account.id,
    label: account.label,
    createdAt: account.createdAt,
    planId: plan.planId,
    plan,
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
