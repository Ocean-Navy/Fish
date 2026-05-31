import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

const ROOT = process.cwd();
const LEDGER_DIR = path.join(ROOT, "data", "fish");
const ACCOUNTS_PATH = path.join(LEDGER_DIR, "accounts.json");
const RECEIPTS_DIR = path.join(LEDGER_DIR, "receipts");

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
  }
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

type UsageReceipt = {
  id: string;
  accountId: string;
  createdAt: string;
  model: string;
  route: "mock" | "ocean-provider" | "external-fallback";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  creditsSpent: number;
  providerId: string | null;
  requestHash: string;
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
  const receipts = await readReceipts(account.id);
  return {
    account: publicAccount(account),
    receipts: receipts.slice(-20).reverse(),
    totals: {
      requests: account.requestCount,
      creditsSpent: account.totalCreditsSpent,
      creditsRemaining: account.creditBalance
    }
  };
}

export async function summarizeFishUsage() {
  const ledger = await readLedger();
  const receipts = await readAllReceipts();
  return {
    dataState: receipts.length > 0 ? "live" : "sample",
    requests: ledger.accounts.reduce((sum, account) => sum + account.requestCount, 0),
    accounts: ledger.accounts.length,
    oceanNativeJobs: receipts.filter((receipt) => receipt.route === "ocean-provider").length,
    externalFallbackJobs: receipts.filter((receipt) => receipt.route === "external-fallback").length,
    mockJobs: receipts.filter((receipt) => receipt.route === "mock").length,
    providerPayoutUsd: 0,
    creditsSpent: ledger.accounts.reduce((sum, account) => sum + account.totalCreditsSpent, 0),
    creditsRemaining: ledger.accounts.reduce((sum, account) => sum + account.creditBalance, 0),
    lastReceiptAt: receipts.at(-1)?.createdAt ?? null
  };
}

export async function recordChatUsage(params: {
  ledger: Ledger;
  account: Account;
  input: ChatCompletionInput;
  promptTokens: number;
  completionTokens: number;
  content: string;
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
  params.account.creditBalance -= creditsSpent;
  params.account.totalCreditsSpent += creditsSpent;
  params.account.requestCount += 1;
  params.account.lastUsedAt = now;

  const receipt: UsageReceipt = {
    id: randomUUID(),
    accountId: params.account.id,
    createdAt: now,
    model: params.input.model,
    route: "mock",
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens,
    creditsSpent,
    providerId: null,
    requestHash: hashSecret(JSON.stringify(params.input.messages))
  };

  await writeLedger(params.ledger);
  await writeReceipt(receipt);

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
