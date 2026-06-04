import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { submitCapacityPoolSettlementOnchain, summarizeFishContracts } from "@/lib/fishContracts";
import type { CapacitySettlementSubmission } from "@/lib/fishContracts";
import type { DataState } from "@/lib/types";

const DEFAULT_SETTLEMENT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "proof", "capacity-settlements");
const TX_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const capacitySettlementRequestSchema = z
  .object({
    grossUsdcAmount: z.number().finite().min(0.000001).max(1000000),
    netUsdcAmount: z.number().finite().min(0).max(1000000).optional(),
    operatorFeeUsdc: z.number().finite().min(0).max(1000000).optional(),
    settlementSource: z.enum(["stripe", "usdc_checkout", "api_subscription", "operator_adjustment"]).default("operator_adjustment"),
    transactionHash: z.string().trim().regex(TX_PATTERN).optional().nullable(),
    capacityPoolAddress: z.string().trim().regex(ADDRESS_PATTERN).optional().nullable(),
    paidDemandRef: z.string().trim().min(1).max(160).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(160).optional().nullable(),
    submitOnchain: z.boolean().default(false),
    occurredAt: z.string().datetime().optional(),
    note: z.string().trim().min(1).max(400).optional().nullable()
  })
  .strict()
  .superRefine((settlement, context) => {
    if (settlement.submitOnchain && !settlement.idempotencyKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idempotencyKey"],
        message: "idempotencyKey is required when submitOnchain is true"
      });
    }
    if (settlement.netUsdcAmount !== undefined && settlement.netUsdcAmount > settlement.grossUsdcAmount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["netUsdcAmount"],
        message: "netUsdcAmount cannot be greater than grossUsdcAmount"
      });
    }
    if (settlement.operatorFeeUsdc !== undefined && settlement.operatorFeeUsdc > settlement.grossUsdcAmount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operatorFeeUsdc"],
        message: "operatorFeeUsdc cannot be greater than grossUsdcAmount"
      });
    }
    if (settlement.netUsdcAmount !== undefined && settlement.operatorFeeUsdc !== undefined) {
      const total = roundUsdc(settlement.netUsdcAmount + settlement.operatorFeeUsdc);
      if (Math.abs(total - roundUsdc(settlement.grossUsdcAmount)) > 0.000001) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["netUsdcAmount"],
          message: "netUsdcAmount plus operatorFeeUsdc must match grossUsdcAmount"
        });
      }
    }
  });

const capacitySettlementSchema = z.object({
  settlementVersion: z.literal(1),
  settlementId: z.string(),
  settlementType: z.literal("fish_capacity_pool_settlement"),
  grossUsdcAmount: z.number(),
  netUsdcAmount: z.number(),
  operatorFeeUsdc: z.number(),
  settlementSource: z.enum(["stripe", "usdc_checkout", "api_subscription", "operator_adjustment"]),
  transactionHash: z.string().nullable(),
  transactionHashPrefix: z.string().nullable(),
  approveTransactionHash: z.string().nullable(),
  submitState: z.enum(["not_submitted", "submitted"]),
  onchainSubmission: z
    .object({
      chainId: z.number().int(),
      operatorAddressPrefix: z.string(),
      grossAmountRaw: z.string(),
      operatorFeeBps: z.number(),
      recordPaidUsageBlockNumber: z.number().nullable(),
      confirmations: z.number()
    })
    .nullable(),
  capacityPoolAddress: z.string().nullable(),
  capacityPoolAddressPrefix: z.string().nullable(),
  paidDemandHash: z.string().nullable(),
  idempotencyHash: z.string().nullable(),
  sourceState: z.enum(["live", "snapshot"]),
  visibility: z.literal("public"),
  occurredAt: z.string(),
  createdAt: z.string()
});

export type CapacitySettlementRequestInput = z.infer<typeof capacitySettlementRequestSchema>;
export type CapacitySettlement = z.infer<typeof capacitySettlementSchema>;

export type CapacitySettlementSummary = {
  dataState: DataState;
  lastUpdated: string;
  totals: {
    settlements: number;
    grossUsdcAmount: number;
    netUsdcAmount: number;
    operatorFeeUsdc: number;
    onchainSubmittedSettlements: number;
  };
  configuredCapacityPoolAddress: string | null;
  settlements: CapacitySettlement[];
  warnings: string[];
};

type CapacitySettlementStorageOptions = {
  settlementDir?: string;
};

export function parseCapacitySettlementRequest(body: unknown) {
  return capacitySettlementRequestSchema.safeParse(body);
}

export async function createCapacitySettlement(input: CapacitySettlementRequestInput, options: CapacitySettlementStorageOptions = {}) {
  const idempotencyHash = input.idempotencyKey ? hashValue(input.idempotencyKey) : null;
  if (idempotencyHash) {
    const existing = await findSettlementByIdempotencyHash(idempotencyHash, options);
    if (existing) {
      return {
        settlement: existing,
        idempotent: true
      };
    }
  }

  const submission = input.submitOnchain ? await submitCapacityPoolSettlementOnchain(input.grossUsdcAmount) : null;
  const contractStatus = await summarizeFishContracts();
  const configuredPool = contractStatus.addresses.find((address) => address.key === "capacityPool")?.address ?? null;
  const operatorFeeUsdc =
    input.operatorFeeUsdc ??
    roundUsdc(input.grossUsdcAmount - (input.netUsdcAmount ?? input.grossUsdcAmount * (1 - (submission?.operatorFeeBps ?? 1000) / 10000)));
  const netUsdcAmount = input.netUsdcAmount ?? roundUsdc(input.grossUsdcAmount - operatorFeeUsdc);
  const now = new Date().toISOString();
  const capacityPoolAddress = input.capacityPoolAddress ?? configuredPool;
  const transactionHash = submission?.recordPaidUsageTxHash ?? input.transactionHash ?? null;

  const settlement: CapacitySettlement = {
    settlementVersion: 1,
    settlementId: `cap_${randomUUID()}`,
    settlementType: "fish_capacity_pool_settlement",
    grossUsdcAmount: roundUsdc(input.grossUsdcAmount),
    netUsdcAmount: roundUsdc(netUsdcAmount),
    operatorFeeUsdc: roundUsdc(operatorFeeUsdc),
    settlementSource: input.settlementSource,
    transactionHash,
    transactionHashPrefix: transactionHash ? `${transactionHash.slice(0, 10)}...${transactionHash.slice(-8)}` : null,
    approveTransactionHash: submission?.approveTxHash ?? null,
    submitState: submission ? "submitted" : "not_submitted",
    onchainSubmission: submission ? publicSubmission(submission) : null,
    capacityPoolAddress,
    capacityPoolAddressPrefix: capacityPoolAddress ? `${capacityPoolAddress.slice(0, 6)}...${capacityPoolAddress.slice(-4)}` : null,
    paidDemandHash: input.paidDemandRef ? hashValue(input.paidDemandRef) : null,
    idempotencyHash,
    sourceState: submission?.sourceState ?? "snapshot",
    visibility: "public",
    occurredAt: input.occurredAt ?? now,
    createdAt: now
  };

  await writeSettlement(settlement, options);
  return {
    settlement,
    idempotent: false
  };
}

export async function summarizeCapacitySettlements(options: CapacitySettlementStorageOptions = {}): Promise<CapacitySettlementSummary> {
  const settlements = await readSettlements(options);
  const sorted = settlements.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const contractStatus = await summarizeFishContracts();
  const configuredCapacityPoolAddress = contractStatus.addresses.find((address) => address.key === "capacityPool")?.address ?? null;
  const liveSettlements = settlements.filter((settlement) => settlement.sourceState === "live").length;

  return {
    dataState: liveSettlements ? "live" : settlements.length ? "snapshot" : "sample",
    lastUpdated: sorted[0]?.occurredAt ?? new Date().toISOString(),
    totals: {
      settlements: settlements.length,
      grossUsdcAmount: sum(settlements.map((settlement) => settlement.grossUsdcAmount)),
      netUsdcAmount: sum(settlements.map((settlement) => settlement.netUsdcAmount)),
      operatorFeeUsdc: sum(settlements.map((settlement) => settlement.operatorFeeUsdc)),
      onchainSubmittedSettlements: liveSettlements
    },
    configuredCapacityPoolAddress,
    settlements: sorted.slice(0, 20),
    warnings: [
      ...(settlements.length ? [] : ["No capacity-pool settlement records yet."]),
      liveSettlements
        ? "Some capacity settlements were submitted through the configured operator wallet and confirmed onchain."
        : "Capacity settlements are operator-reported snapshot records until onchain submission is enabled."
    ]
  };
}

async function writeSettlement(settlement: CapacitySettlement, options: CapacitySettlementStorageOptions) {
  const dir = options.settlementDir ?? DEFAULT_SETTLEMENT_DIR;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, `${settlement.occurredAt}-${settlement.settlementId}.json`.replaceAll(":", "-")), `${JSON.stringify(settlement, null, 2)}\n`);
}

async function readSettlements(options: CapacitySettlementStorageOptions) {
  try {
    const dir = options.settlementDir ?? DEFAULT_SETTLEMENT_DIR;
    const files = await readdir(/*turbopackIgnore: true*/ dir);
    const settlements = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          try {
            const raw = await readFile(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
            const parsed = capacitySettlementSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        })
    );
    return settlements.filter((settlement): settlement is CapacitySettlement => settlement !== null);
  } catch {
    return [];
  }
}

async function findSettlementByIdempotencyHash(idempotencyHash: string, options: CapacitySettlementStorageOptions) {
  const settlements = await readSettlements(options);
  return settlements.find((settlement) => settlement.idempotencyHash === idempotencyHash) ?? null;
}

function publicSubmission(submission: CapacitySettlementSubmission): CapacitySettlement["onchainSubmission"] {
  return {
    chainId: submission.chainId,
    operatorAddressPrefix: `${submission.operatorAddress.slice(0, 6)}...${submission.operatorAddress.slice(-4)}`,
    grossAmountRaw: submission.grossAmountRaw,
    operatorFeeBps: submission.operatorFeeBps,
    recordPaidUsageBlockNumber: submission.recordPaidUsageBlockNumber,
    confirmations: submission.confirmations
  };
}

function roundUsdc(value: number) {
  return Number(value.toFixed(6));
}

function sum(values: number[]) {
  return roundUsdc(values.reduce((total, value) => total + value, 0));
}

function hashValue(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
