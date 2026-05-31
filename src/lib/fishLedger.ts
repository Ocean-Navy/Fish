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
  creditGrant: z.number().int().min(1).max(100000).optional().default(1000)
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
  max_tokens: z.number().int().min(1).max(4096).optional()
});

export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>;

type Account = {
  id: string;
  label: string;
  keyHash: string;
  createdAt: string;
  creditBalance: number;
  totalCreditsGranted: number;
  totalCreditsSpent: number;
  requestCount: number;
  lastUsedAt: string | null;
};

type Ledger = {
  accounts: Account[];
};

export type CreditLane = (typeof CREDIT_LANES)[number];
export type CreditEntryKind = "grant" | "debit" | "refund" | "adjustment";

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
  route: "mock" | "ocean-provider" | "external-fallback";
  costState: "prototype_estimate" | "provider_verified" | "fallback_verified";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  creditsSpent: number;
  userChargeUsd: number;
  providerCostUsd: number;
  grossMarginUsd: number;
  providerId: string | null;
  requestHash: string;
};

export type FishUsageSummary = {
  dataState: DataState;
  requests: number;
  accounts: number;
  oceanNativeJobs: number;
  externalFallbackJobs: number;
  mockJobs: number;
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

export async function createApiKey(label: string, creditGrant: number) {
  const ledger = await readLedger();
  const key = `fish_sk_${randomBytes(24).toString("base64url")}`;
  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(),
    label,
    keyHash: hashSecret(key),
    createdAt: now,
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

export async function summarizeFishUsage(): Promise<FishUsageSummary> {
  const ledger = await readLedger();
  const [receipts, creditEntries] = await Promise.all([readAllReceipts(), readCreditEntries()]);
  const costs = summarizeReceiptCosts(receipts);
  const dataState: DataState = receipts.length > 0 ? "live" : "sample";
  const creditLanes = summarizeCreditLanes(includeLegacyCreditSeeds(ledger.accounts, creditEntries), {
    creditBalance: ledger.accounts.reduce((sum, account) => sum + account.creditBalance, 0),
    totalCreditsGranted: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsGranted, 0),
    totalCreditsSpent: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsSpent, 0)
  });
  return {
    dataState,
    requests: ledger.accounts.reduce((sum, account) => sum + account.requestCount, 0),
    accounts: ledger.accounts.length,
    oceanNativeJobs: receipts.filter((receipt) => receipt.route === "ocean-provider").length,
    externalFallbackJobs: receipts.filter((receipt) => receipt.route === "external-fallback").length,
    mockJobs: receipts.filter((receipt) => receipt.route === "mock").length,
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
  providerCostUsd?: number;
  providerId?: string | null;
}) {
  const totalTokens = params.promptTokens + params.completionTokens;
  const creditsSpent = Math.max(1, Math.ceil(totalTokens / 1000));
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

  const requestId = randomUUID();
  const receiptId = randomUUID();
  const creditEntryId = randomUUID();
  const receipt: UsageReceipt = {
    id: receiptId,
    accountId: params.account.id,
    creditEntryId,
    creditLane: "grant",
    createdAt: now,
    model: params.model ?? params.input.model,
    route: params.route ?? "mock",
    costState: params.costState ?? "prototype_estimate",
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens,
    creditsSpent,
    userChargeUsd,
    providerCostUsd,
    grossMarginUsd,
    providerId: params.providerId ?? null,
    requestHash: hashSecret(JSON.stringify(params.input.messages))
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
  return {
    id: account.id,
    label: account.label,
    createdAt: account.createdAt,
    creditBalance: account.creditBalance,
    totalCreditsGranted: account.totalCreditsGranted,
    totalCreditsSpent: account.totalCreditsSpent,
    requestCount: account.requestCount,
    lastUsedAt: account.lastUsedAt
  };
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
