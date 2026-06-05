import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createApiKey, summarizeAccountById } from "@/lib/fishLedger";
import type { DataState } from "@/lib/types";

const STAKING_DIR = path.join(process.cwd(), "data", "staking");
const POSITIONS_DIR = path.join(STAKING_DIR, "positions");
const DEFAULT_CREDIT_BUDGET = Number(process.env.FISH_STAKING_CREDIT_BUDGET ?? "10000");
const DEFAULT_CREDITS_PER_OCEAN_MONTH = Number(process.env.FISH_STAKING_CREDITS_PER_OCEAN_MONTH ?? "0.1");

const stakingPositionRequestSchema = z
  .object({
    holderLabel: z.string().trim().min(1).max(80).optional().default("Ocean holder"),
    walletRef: z.string().trim().min(4).max(180),
    oceanAmount: z.number().finite().min(1).max(100000000),
    lockDays: z.number().int().min(7).max(730).default(30),
    budgetId: z.string().trim().min(1).max(80).default("pilot-credit-budget-v1"),
    issueApiKey: z.boolean().default(true)
  })
  .strict();

const stakingPositionSchema = z.object({
  positionVersion: z.literal(1),
  positionId: z.string(),
  holderLabel: z.string(),
  walletHash: z.string(),
  budgetId: z.string(),
  oceanAmount: z.number(),
  lockDays: z.number(),
  creditsPerOceanMonth: z.number(),
  creditsEarned: z.number(),
  creditsIssued: z.number(),
  linkedFishAccountId: z.string().nullable(),
  creditState: z.enum(["issued", "partial", "queued"]),
  sourceState: z.enum(["live", "snapshot", "sample", "unavailable"]),
  visibility: z.literal("public"),
  createdAt: z.string(),
  unlocksAt: z.string()
});

export type StakingPositionRequestInput = z.infer<typeof stakingPositionRequestSchema>;
type StakingPosition = z.infer<typeof stakingPositionSchema>;

export type PublicStakingPosition = Pick<
  StakingPosition,
  "positionVersion" | "positionId" | "creditState" | "sourceState" | "visibility" | "createdAt"
>;

export type StakingCreditSummary = {
  dataState: DataState;
  lastUpdated: string;
  policy: {
    budgetId: string;
    creditBudget: number;
    creditsPerOceanMonth: number;
    minLockDays: number;
    maxLockDays: number;
    onchainState: "offchain_prototype";
  };
  totals: {
    positions: number;
    activePositions: number;
    queuedPositions: number;
    oceanStaked: number;
    creditsEarned: number;
    creditsIssued: number;
    creditsSpent: number;
    creditsRemaining: number;
    budgetRemaining: number;
    averageLockDays: number | null;
  };
  positions: PublicStakingPosition[];
  warnings: string[];
};

export function parseStakingPositionRequest(body: unknown) {
  return stakingPositionRequestSchema.safeParse(body);
}

export async function createStakingPosition(input: StakingPositionRequestInput) {
  const positions = await readPositions();
  const now = new Date();
  const earnedCredits = calculateStakingCredits(input.oceanAmount, input.lockDays);
  const budgetRemaining = Math.max(0, DEFAULT_CREDIT_BUDGET - sum(positions.map((position) => position.creditsIssued)));
  const creditsIssued = Math.min(earnedCredits, budgetRemaining);
  const accountResult = input.issueApiKey && creditsIssued > 0 ? await createApiKey(`Stake credits - ${input.holderLabel}`, creditsIssued) : null;
  const position: StakingPosition = {
    positionVersion: 1,
    positionId: `stake_${randomUUID()}`,
    holderLabel: input.holderLabel,
    walletHash: hashWallet(input.walletRef),
    budgetId: input.budgetId,
    oceanAmount: input.oceanAmount,
    lockDays: input.lockDays,
    creditsPerOceanMonth: DEFAULT_CREDITS_PER_OCEAN_MONTH,
    creditsEarned: earnedCredits,
    creditsIssued,
    linkedFishAccountId: accountResult?.account.id ?? null,
    creditState: creditsIssued === 0 ? "queued" : creditsIssued < earnedCredits ? "partial" : "issued",
    sourceState: "live",
    visibility: "public",
    createdAt: now.toISOString(),
    unlocksAt: new Date(now.getTime() + input.lockDays * 24 * 60 * 60 * 1000).toISOString()
  };

  await writePosition(position);
  return {
    position: toPublicPosition(position),
    apiKey: accountResult?.key ?? null,
    keyNotice: accountResult ? "Store this key now. Fish only stores a hash." : null
  };
}

export async function summarizeStakingCredits(): Promise<StakingCreditSummary> {
  const positions = await readPositions();
  const publicPositions = positions.map(toPublicPosition);
  const creditTotals = await summarizePositionCreditTotals(positions);
  const lastUpdated = positions.map((position) => position.createdAt).sort().at(-1) ?? new Date().toISOString();
  const creditsIssued = sum(positions.map((position) => position.creditsIssued));
  const budgetRemaining = Math.max(0, DEFAULT_CREDIT_BUDGET - creditsIssued);

  return {
    dataState: positions.length ? "live" : "sample",
    lastUpdated,
    policy: {
      budgetId: "pilot-credit-budget-v1",
      creditBudget: DEFAULT_CREDIT_BUDGET,
      creditsPerOceanMonth: DEFAULT_CREDITS_PER_OCEAN_MONTH,
      minLockDays: 7,
      maxLockDays: 730,
      onchainState: "offchain_prototype"
    },
    totals: {
      positions: positions.length,
      activePositions: positions.filter((position) => position.creditState !== "queued").length,
      queuedPositions: positions.filter((position) => position.creditState === "queued").length,
      oceanStaked: sum(positions.map((position) => position.oceanAmount)),
      creditsEarned: sum(positions.map((position) => position.creditsEarned)),
      creditsIssued,
      creditsSpent: creditTotals.creditsSpent,
      creditsRemaining: creditTotals.creditsRemaining,
      budgetRemaining,
      averageLockDays: positions.length ? Number((sum(positions.map((position) => position.lockDays)) / positions.length).toFixed(2)) : null
    },
    positions: publicPositions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
    warnings: [
      ...(positions.length ? [] : ["No offchain OCEAN stake records yet. This page is ready for a funded pilot budget."]),
      ...(budgetRemaining ? [] : ["The pilot staking credit budget is exhausted. New stake records queue credits until the budget is refilled."]),
      ...(positions.some((position) => position.creditState === "partial" || position.creditState === "queued") ? ["Some stake records could not receive their full earned credits because of the budget cap."] : [])
    ]
  };
}

function toPublicPosition(position: StakingPosition): PublicStakingPosition {
  return {
    positionVersion: position.positionVersion,
    positionId: position.positionId,
    creditState: position.creditState,
    sourceState: position.sourceState,
    visibility: position.visibility,
    createdAt: position.createdAt
  };
}

async function summarizePositionCreditTotals(positions: StakingPosition[]) {
  const accountTotals = await Promise.all(
    positions.map(async (position) => {
      const account = position.linkedFishAccountId ? await summarizeAccountById(position.linkedFishAccountId) : null;
      return {
        creditsSpent: account?.totals.creditsSpent ?? 0,
        creditsRemaining: account?.totals.creditsRemaining ?? position.creditsIssued
      };
    })
  );

  return {
    creditsSpent: sum(accountTotals.map((account) => account.creditsSpent)),
    creditsRemaining: sum(accountTotals.map((account) => account.creditsRemaining))
  };
}

async function writePosition(position: StakingPosition) {
  await mkdir(POSITIONS_DIR, { recursive: true });
  await writeFile(path.join(POSITIONS_DIR, `${position.createdAt}-${position.positionId}.json`.replaceAll(":", "-")), JSON.stringify(position, null, 2));
}

async function readPositions(): Promise<StakingPosition[]> {
  try {
    const files = await readdir(POSITIONS_DIR);
    const positions = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(POSITIONS_DIR, file), "utf8");
          const parsed = stakingPositionSchema.safeParse(JSON.parse(raw));
          return parsed.success ? parsed.data : null;
        })
    );
    return positions.filter((position): position is StakingPosition => position !== null);
  } catch {
    return [];
  }
}

export function calculateStakingCredits(oceanAmount: number, lockDays: number) {
  return Math.max(1, Math.floor(oceanAmount * (lockDays / 30) * DEFAULT_CREDITS_PER_OCEAN_MONTH));
}

function hashWallet(value: string) {
  return `sha256:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
}


function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(6));
}
