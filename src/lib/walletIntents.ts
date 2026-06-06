import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { z } from "zod";
import { calculateStakingCredits } from "@/lib/stakingCredits";
import type { DataState } from "@/lib/types";

const WALLET_INTENT_DIR = path.join(process.cwd(), "data", "staking", "wallet-intents");
const DEFAULT_MAX_WALLET_INTENTS = 1000;
const WALLET_INTENT_LOCK_STALE_MS = 30_000;
const WALLET_INTENT_LOCK_RETRY_MS = 10;

const walletIntentRequestSchema = z
  .object({
    holderLabel: z.string().trim().min(1).max(80).optional().default("Ocean holder"),
    address: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/),
    chainId: z.number().int().min(1).max(100000000),
    oceanAmount: z.number().finite().min(1).max(100000000),
    lockDays: z.number().int().min(7).max(730).default(30),
    message: z.string().trim().min(40).max(1200),
    signature: z.string().trim().regex(/^0x[a-fA-F0-9]{130}$/)
  })
  .strict()
  .superRefine((intent, context) => {
    const message = intent.message.toLowerCase();
    if (!message.includes("fish ocean credit intent")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message must be a Fish OCEAN credit intent"
      });
    }
    if (!message.includes(intent.address.toLowerCase())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message must include the connected address"
      });
    }
  });

const walletIntentSchema = z.object({
  intentVersion: z.literal(1),
  intentId: z.string(),
  holderLabel: z.string(),
  addressHash: z.string(),
  addressPrefix: z.string(),
  chainId: z.number().int(),
  oceanAmount: z.number(),
  lockDays: z.number().int(),
  estimatedCredits: z.number().int(),
  messageHash: z.string(),
  signatureHash: z.string(),
  signatureState: z.literal("submitted_unverified"),
  sourceState: z.literal("snapshot"),
  createdAt: z.string()
});

export type WalletIntentRequestInput = z.infer<typeof walletIntentRequestSchema>;
type WalletIntent = z.infer<typeof walletIntentSchema>;

export type PublicWalletIntent = WalletIntent;

export type WalletIntentSummary = {
  dataState: DataState;
  lastUpdated: string;
  totals: {
    intents: number;
    oceanAmount: number;
    estimatedCredits: number;
  };
  intents: PublicWalletIntent[];
  warnings: string[];
};

export function parseWalletIntentRequest(body: unknown) {
  return walletIntentRequestSchema.safeParse(body);
}

export async function createWalletIntent(input: WalletIntentRequestInput) {
  return withWalletIntentLock(async () => {
    const limit = maxWalletIntents();
    const existing = await countWalletIntentFiles();
    if (existing >= limit) {
      return {
        ok: false as const,
        status: 429,
        error: "wallet_intent_limit_reached",
        limit
      };
    }

    const createdAt = new Date().toISOString();
    const intent: WalletIntent = {
      intentVersion: 1,
      intentId: `wallet_intent_${randomUUID()}`,
      holderLabel: input.holderLabel,
      addressHash: hashValue(input.address.toLowerCase()),
      addressPrefix: `${input.address.slice(0, 6)}...${input.address.slice(-4)}`,
      chainId: input.chainId,
      oceanAmount: input.oceanAmount,
      lockDays: input.lockDays,
      estimatedCredits: calculateStakingCredits(input.oceanAmount, input.lockDays),
      messageHash: hashValue(input.message),
      signatureHash: hashValue(input.signature),
      signatureState: "submitted_unverified",
      sourceState: "snapshot",
      createdAt
    };
    await writeWalletIntent(intent);
    return {
      ok: true as const,
      intent
    };
  });
}

export async function summarizeWalletIntents(): Promise<WalletIntentSummary> {
  const intents = await readWalletIntents();
  const sorted = intents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    dataState: intents.length ? "snapshot" : "sample",
    lastUpdated: sorted[0]?.createdAt ?? new Date().toISOString(),
    totals: {
      intents: intents.length,
      oceanAmount: sum(intents.map((intent) => intent.oceanAmount)),
      estimatedCredits: Math.round(sum(intents.map((intent) => intent.estimatedCredits)))
    },
    intents: sorted.slice(0, 20),
    warnings: [
      ...(intents.length ? [] : ["No wallet lock intents yet."]),
      "Wallet intents are not verified staking and do not issue credits until an operator or future lock contract verifies them."
    ]
  };
}

async function writeWalletIntent(intent: WalletIntent) {
  await mkdir(WALLET_INTENT_DIR, { recursive: true });
  await writeFile(path.join(WALLET_INTENT_DIR, `${intent.createdAt}-${intent.intentId}.json`.replaceAll(":", "-")), `${JSON.stringify(intent, null, 2)}\n`);
}

async function countWalletIntentFiles() {
  try {
    const files = await readdir(WALLET_INTENT_DIR);
    return files.filter((file) => file.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

async function readWalletIntents() {
  try {
    const files = await readdir(WALLET_INTENT_DIR);
    const intents = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const raw = await readFile(path.join(WALLET_INTENT_DIR, file), "utf8");
            const parsed = walletIntentSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        })
    );
    return intents.filter((intent): intent is WalletIntent => intent !== null);
  } catch {
    return [];
  }
}

function hashValue(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(6));
}

function maxWalletIntents() {
  return readPositiveInt(process.env.FISH_MAX_WALLET_INTENTS, DEFAULT_MAX_WALLET_INTENTS);
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function withWalletIntentLock<T>(operation: () => Promise<T>) {
  await mkdir(WALLET_INTENT_DIR, { recursive: true });
  const lockPath = path.join(WALLET_INTENT_DIR, ".wallet-intents.lock");
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`${process.pid}:${new Date().toISOString()}`);
        return await operation();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (await removeStaleWalletIntentLock(lockPath)) {
        continue;
      }
      await sleep(WALLET_INTENT_LOCK_RETRY_MS);
    }
  }
}

async function removeStaleWalletIntentLock(lockPath: string) {
  try {
    const fileStat = await stat(lockPath);
    if (Date.now() - fileStat.mtimeMs <= WALLET_INTENT_LOCK_STALE_MS) {
      return false;
    }
    await rm(lockPath, { force: true });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}
