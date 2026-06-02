import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";
import type { ProviderPilotRegistry, ProviderPilotStatus } from "@/lib/providerPilot";
import type { DataState } from "@/lib/types";

const PROVIDER_BONDS_DIR = path.join(process.cwd(), "data", "proof", "provider-bonds", "positions");
const DEFAULT_UNLOCK_DELAY_DAYS = 30;

const providerBondStateSchema = z.enum(["draft", "active", "unlock_requested", "unlockable", "released", "held", "disputed", "paused"]);
const providerBondQuerySchema = z.object({
  provider: z.string().trim().min(1).max(160).optional(),
  providerId: z.string().trim().min(1).max(160).optional(),
  state: providerBondStateSchema.optional(),
  activeOnly: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const providerBondRequestSchema = z
  .object({
    bondId: z.string().trim().min(1).max(180).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
    providerId: z.string().trim().min(1).max(180),
    providerLabel: z.string().trim().min(1).max(160).optional(),
    bondState: providerBondStateSchema.default("active"),
    oceanAmount: z.number().finite().min(0).max(10_000_000_000).optional(),
    walletRef: z.string().trim().min(3).max(280).optional(),
    walletRefHash: z.string().trim().min(8).max(160).optional(),
    startsAt: z.string().trim().min(1).refine(isDateLike, "startsAt must be a valid date").optional(),
    unlockRequestedAt: z.string().trim().min(1).refine(isDateLike, "unlockRequestedAt must be a valid date").nullable().optional(),
    unlockAvailableAt: z.string().trim().min(1).refine(isDateLike, "unlockAvailableAt must be a valid date").nullable().optional(),
    unlockDelayDays: z.number().int().min(0).max(3650).default(DEFAULT_UNLOCK_DELAY_DAYS),
    operatorOwner: z.string().trim().min(1).max(120).default("operator"),
    decisionReason: z.string().trim().min(1).max(500)
  })
  .superRefine((input, context) => {
    if (input.unlockRequestedAt && input.unlockAvailableAt && Date.parse(input.unlockRequestedAt) > Date.parse(input.unlockAvailableAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unlockAvailableAt"],
        message: "unlockAvailableAt must be after unlockRequestedAt"
      });
    }
  });

const storedProviderBondPositionSchema = z.object({
  bondId: z.string(),
  providerId: z.string(),
  providerLabel: z.string(),
  bondState: providerBondStateSchema,
  oceanAmount: z.number(),
  walletRefHash: z.string(),
  startsAt: z.string(),
  unlockRequestedAt: z.string().nullable(),
  unlockAvailableAt: z.string().nullable(),
  operatorOwner: z.string(),
  decisionReason: z.string(),
  offchainPrototype: z.literal(true),
  visibility: z.literal("operator"),
  sourceState: z.enum(["live", "snapshot", "sample", "unavailable"]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ProviderBondState = z.infer<typeof providerBondStateSchema>;
export type ProviderBondQuery = z.infer<typeof providerBondQuerySchema>;
export type ProviderBondRequestInput = z.infer<typeof providerBondRequestSchema>;

export type ProviderBondPosition = z.infer<typeof storedProviderBondPositionSchema>;

export type PublicProviderBondRow = {
  bondId: string;
  providerId: string;
  providerLabel: string;
  bondState: ProviderBondState;
  amountBucket: string;
  activeForRouting: boolean;
  bondTier: number;
  unlockState: "locked" | "unlock_requested" | "unlockable" | "released" | "held" | "paused" | "disputed" | "draft";
  unlockAvailableAt: string | null;
  offchainPrototype: true;
  updatedAt: string;
};

export type ProviderBondSignal = {
  providerId: string;
  providerLabel: string;
  bondState: ProviderBondState | "none";
  activeBondCount: number;
  totalBondCount: number;
  activeOceanAmount: number;
  amountBucket: string;
  activeForRouting: boolean;
  latestUpdatedAt: string | null;
  unlockAvailableAt: string | null;
  offchainPrototype: true;
};

export type ProviderBondRoutingInput = {
  selected: boolean;
  score: number;
  signal: "ready" | "proving" | "needs_run" | "review" | "attention";
  displayState: "new" | "allowed" | "preferred" | "probation" | "paused" | "exited";
  bond: ProviderBondSignal | PublicProviderBondRow | undefined;
};

export type ProviderBondRoutingImpact = {
  bondState: ProviderBondState | "none";
  bondAmountBucket: string;
  bondActiveForRouting: boolean;
  bondScoreTier: number;
  bondBoostTier: number;
  bondRouteTier: number;
  bondBoostEligible: boolean;
  bondBoostBlockedReason: string | null;
  bondUpdatedAt: string | null;
  bondUnlockAvailableAt: string | null;
};

export type ProviderBondSummary = {
  dataState: DataState;
  lastUpdated: string;
  visibility: "public";
  offchainPrototype: true;
  filters: ProviderBondQuery;
  totals: {
    records: number;
    providers: number;
    bondedProviders: number;
    activeBonds: number;
    heldOrDisputedBonds: number;
    pausedBonds: number;
    releasedBonds: number;
    activeOceanBondedRounded: number;
    activeOceanBondedBucket: string;
    averageLockDays: number | null;
  };
  routeRules: string[];
  rows: PublicProviderBondRow[];
  warnings: string[];
};

export function parseProviderBondQuery(searchParams: URLSearchParams) {
  return providerBondQuerySchema.safeParse(queryObject(searchParams));
}

export function parseProviderBondRequest(body: unknown) {
  return providerBondRequestSchema.safeParse(body);
}

export async function createProviderBondPosition(input: ProviderBondRequestInput): Promise<{ ok: true; created: boolean; position: ProviderBondPosition } | { ok: false; status: number; error: string }> {
  const [positions, registry] = await Promise.all([readProviderBondPositions(), collectProviderPilotRegistry()]);
  const existing = input.bondId ? positions.find((position) => position.bondId === input.bondId) : undefined;
  const provider = registry.providers.find((candidate) => candidate.providerId === input.providerId);
  const allowlist = registry.allowlist.find((entry) => entry.providerId === input.providerId);

  if (!provider) {
    return { ok: false, status: 404, error: "provider_not_found" };
  }

  if (!existing && !canProviderBond(provider.pilotStatus, Boolean(allowlist))) {
    return { ok: false, status: 403, error: "provider_not_eligible_for_bond" };
  }

  const now = new Date().toISOString();
  const oceanAmount = input.oceanAmount ?? existing?.oceanAmount;
  if (oceanAmount === undefined) {
    return { ok: false, status: 400, error: "ocean_amount_required" };
  }

  const walletRefHash = input.walletRefHash ?? (input.walletRef ? shortHash(input.walletRef) : existing?.walletRefHash);
  if (!walletRefHash) {
    return { ok: false, status: 400, error: "wallet_ref_required" };
  }

  const unlockRequestedAt = resolveUnlockRequestedAt(input, existing, now);
  const unlockAvailableAt = resolveUnlockAvailableAt(input, existing, unlockRequestedAt);
  const position: ProviderBondPosition = {
    bondId: existing?.bondId ?? input.bondId ?? `bond_${randomUUID()}`,
    providerId: input.providerId,
    providerLabel: input.providerLabel ?? provider.publicLabel,
    bondState: input.bondState,
    oceanAmount,
    walletRefHash,
    startsAt: input.startsAt ?? existing?.startsAt ?? now,
    unlockRequestedAt,
    unlockAvailableAt,
    operatorOwner: input.operatorOwner,
    decisionReason: input.decisionReason,
    offchainPrototype: true,
    visibility: "operator",
    sourceState: "live",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await writeProviderBondPosition(position);
  return { ok: true, created: !existing, position };
}

export async function summarizeProviderBonds(query: ProviderBondQuery = { activeOnly: false, limit: 100 }, registry?: ProviderPilotRegistry): Promise<ProviderBondSummary> {
  const [positions, providerRegistry] = await Promise.all([readProviderBondPositions(), registry ? Promise.resolve(registry) : collectProviderPilotRegistry()]);
  const signalsByProvider = buildProviderBondSignals(positions, providerRegistry);
  const filteredRows = positions
    .filter((position) => matchesBondQuery(position, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, query.limit)
    .map((position) => {
      const signal = signalsByProvider.get(position.providerId);
      return toPublicBondRow(position, signal);
    });
  const activePositions = positions.filter((position) => position.bondState === "active");
  const lastUpdated = latestTimestamp(positions.map((position) => position.updatedAt));
  const lockDays = positions.flatMap((position) => lockDaysFor(position));

  return {
    dataState: positions.length ? "live" : "sample",
    lastUpdated: lastUpdated ?? new Date().toISOString(),
    visibility: "public",
    offchainPrototype: true,
    filters: query,
    totals: {
      records: positions.length,
      providers: new Set(positions.map((position) => position.providerId)).size,
      bondedProviders: new Set(activePositions.map((position) => position.providerId)).size,
      activeBonds: activePositions.length,
      heldOrDisputedBonds: positions.filter((position) => position.bondState === "held" || position.bondState === "disputed").length,
      pausedBonds: positions.filter((position) => position.bondState === "paused").length,
      releasedBonds: positions.filter((position) => position.bondState === "released").length,
      activeOceanBondedRounded: roundOcean(sum(activePositions.map((position) => position.oceanAmount))),
      activeOceanBondedBucket: amountBucket(sum(activePositions.map((position) => position.oceanAmount))),
      averageLockDays: lockDays.length ? Number((sum(lockDays) / lockDays.length).toFixed(1)) : null
    },
    routeRules: [
      "Provider bonds are offchain prototype records until a reviewed contract exists.",
      "Only selected or verified providers can record a first bond.",
      "An active OCEAN bond can improve routing readiness, but proof score and health cap the boost.",
      "Held, disputed, paused, or released bonds do not boost routing."
    ],
    rows: filteredRows,
    warnings: [
      ...(positions.length ? [] : ["No provider OCEAN bonds are recorded yet."]),
      ...(positions.some((position) => position.bondState === "held" || position.bondState === "disputed") ? ["One or more provider bonds are held or disputed and must not boost routing."] : [])
    ]
  };
}

export async function getProviderBondSignals(registry?: ProviderPilotRegistry): Promise<Map<string, ProviderBondSignal>> {
  const [positions, providerRegistry] = await Promise.all([readProviderBondPositions(), registry ? Promise.resolve(registry) : collectProviderPilotRegistry()]);
  return buildProviderBondSignals(positions, providerRegistry);
}

export function buildProviderBondRoutingImpact(input: ProviderBondRoutingInput): ProviderBondRoutingImpact {
  const bondState = input.bond?.bondState ?? "none";
  const bondAmountBucket = input.bond?.amountBucket ?? "No OCEAN bond";
  const activeForRouting = Boolean(input.bond?.activeForRouting);
  const activeOceanAmount = input.bond && "activeOceanAmount" in input.bond ? input.bond.activeOceanAmount : 0;
  const bondBoostTier = activeForRouting ? bondTierForAmount(activeOceanAmount) : 0;
  const bondScoreTier = scoreTierForBond(input);
  const unhealthy = input.signal === "attention" || input.displayState === "paused" || input.displayState === "exited";
  const bondBoostEligible = input.selected && activeForRouting && !unhealthy && bondScoreTier > 0;
  const bondRouteTier = bondBoostEligible ? Math.min(bondScoreTier, 1 + bondBoostTier) : 0;
  const bondUpdatedAt = input.bond && "latestUpdatedAt" in input.bond ? input.bond.latestUpdatedAt : input.bond?.updatedAt ?? null;

  return {
    bondState,
    bondAmountBucket,
    bondActiveForRouting: activeForRouting,
    bondScoreTier,
    bondBoostTier,
    bondRouteTier,
    bondBoostEligible,
    bondBoostBlockedReason: bondBoostEligible ? null : bondBoostBlockReason({ ...input, bondState, activeForRouting, unhealthy, bondScoreTier }),
    bondUpdatedAt,
    bondUnlockAvailableAt: input.bond?.unlockAvailableAt ?? null
  };
}

function buildProviderBondSignals(positions: ProviderBondPosition[], registry: ProviderPilotRegistry) {
  const providerLabels = new Map(registry.providers.map((provider) => [provider.providerId, provider.publicLabel]));
  const byProvider = groupBy(positions, (position) => position.providerId);
  const signals = new Map<string, ProviderBondSignal>();

  for (const [providerId, providerPositions] of byProvider) {
    const activePositions = providerPositions.filter((position) => position.bondState === "active");
    const latest = [...providerPositions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const activeOceanAmount = sum(activePositions.map((position) => position.oceanAmount));
    signals.set(providerId, {
      providerId,
      providerLabel: providerLabels.get(providerId) ?? latest?.providerLabel ?? providerId,
      bondState: latest?.bondState ?? "none",
      activeBondCount: activePositions.length,
      totalBondCount: providerPositions.length,
      activeOceanAmount,
      amountBucket: amountBucket(activeOceanAmount),
      activeForRouting: activePositions.length > 0,
      latestUpdatedAt: latest?.updatedAt ?? null,
      unlockAvailableAt: latest?.unlockAvailableAt ?? null,
      offchainPrototype: true
    });
  }

  return signals;
}

function toPublicBondRow(position: ProviderBondPosition, signal: ProviderBondSignal | undefined): PublicProviderBondRow {
  const activeOceanAmount = signal?.activeOceanAmount ?? (position.bondState === "active" ? position.oceanAmount : 0);
  const bondTier = position.bondState === "active" ? bondTierForAmount(activeOceanAmount) : 0;
  return {
    bondId: position.bondId,
    providerId: position.providerId,
    providerLabel: position.providerLabel,
    bondState: position.bondState,
    amountBucket: amountBucket(position.bondState === "active" ? position.oceanAmount : 0),
    activeForRouting: position.bondState === "active",
    bondTier,
    unlockState: unlockStateFor(position),
    unlockAvailableAt: position.unlockAvailableAt,
    offchainPrototype: true,
    updatedAt: position.updatedAt
  };
}

function canProviderBond(status: ProviderPilotStatus, selected: boolean) {
  return selected || status === "verified" || status === "allowed" || status === "probation";
}

function resolveUnlockRequestedAt(input: ProviderBondRequestInput, existing: ProviderBondPosition | undefined, now: string) {
  if (input.bondState === "unlock_requested" && input.unlockRequestedAt === undefined) {
    return existing?.unlockRequestedAt ?? now;
  }
  if (input.bondState === "released") {
    return input.unlockRequestedAt ?? existing?.unlockRequestedAt ?? now;
  }
  return input.unlockRequestedAt === undefined ? existing?.unlockRequestedAt ?? null : input.unlockRequestedAt;
}

function resolveUnlockAvailableAt(input: ProviderBondRequestInput, existing: ProviderBondPosition | undefined, unlockRequestedAt: string | null) {
  if (input.unlockAvailableAt !== undefined) {
    return input.unlockAvailableAt;
  }
  if (input.bondState === "unlock_requested" && unlockRequestedAt) {
    return addDays(unlockRequestedAt, input.unlockDelayDays);
  }
  return existing?.unlockAvailableAt ?? null;
}

async function writeProviderBondPosition(position: ProviderBondPosition) {
  await mkdir(PROVIDER_BONDS_DIR, { recursive: true });
  await writeFile(path.join(PROVIDER_BONDS_DIR, `${position.bondId}.json`), JSON.stringify(position, null, 2));
}

async function readProviderBondPositions(): Promise<ProviderBondPosition[]> {
  try {
    const files = await readdir(PROVIDER_BONDS_DIR);
    const positions = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(PROVIDER_BONDS_DIR, file), "utf8");
          const parsed = storedProviderBondPositionSchema.safeParse(JSON.parse(raw));
          return parsed.success ? parsed.data : null;
        })
    );
    return positions.filter((position): position is ProviderBondPosition => Boolean(position));
  } catch {
    return [];
  }
}

function matchesBondQuery(position: ProviderBondPosition, query: ProviderBondQuery) {
  if (query.providerId && position.providerId !== query.providerId) {
    return false;
  }
  if (query.provider) {
    const needle = query.provider.toLowerCase();
    if (!position.providerId.toLowerCase().includes(needle) && !position.providerLabel.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (query.state && position.bondState !== query.state) {
    return false;
  }
  if (query.activeOnly && position.bondState !== "active") {
    return false;
  }
  return true;
}

function scoreTierForBond(input: Pick<ProviderBondRoutingInput, "score" | "signal" | "displayState">) {
  if (input.signal === "attention" || input.displayState === "paused" || input.displayState === "exited") {
    return 0;
  }
  if (input.score >= 85) {
    return 4;
  }
  if (input.score >= 75) {
    return 3;
  }
  if (input.score >= 60) {
    return 2;
  }
  if (input.score >= 45) {
    return 1;
  }
  return 0;
}

function bondBoostBlockReason(input: ProviderBondRoutingInput & { bondState: ProviderBondState | "none"; activeForRouting: boolean; unhealthy: boolean; bondScoreTier: number }) {
  if (!input.selected) {
    return "provider_not_selected";
  }
  if (input.unhealthy) {
    return "provider_needs_review";
  }
  if (input.bondState === "none") {
    return "no_ocean_bond_recorded";
  }
  if (!input.activeForRouting) {
    return `bond_${input.bondState}_not_route_active`;
  }
  if (input.bondScoreTier === 0) {
    return "score_too_low_for_bond_boost";
  }
  return "bond_not_eligible";
}

function bondTierForAmount(amount: number) {
  if (amount >= 100_000) {
    return 3;
  }
  if (amount >= 10_000) {
    return 2;
  }
  if (amount >= 1_000) {
    return 1;
  }
  return 0;
}

function amountBucket(amount: number) {
  if (amount <= 0) {
    return "No active OCEAN bond";
  }
  if (amount < 1_000) {
    return "Under 1k OCEAN";
  }
  if (amount < 10_000) {
    return "1k-10k OCEAN";
  }
  if (amount < 100_000) {
    return "10k-100k OCEAN";
  }
  return "100k+ OCEAN";
}

function unlockStateFor(position: ProviderBondPosition): PublicProviderBondRow["unlockState"] {
  if (position.bondState === "unlock_requested" && position.unlockAvailableAt && Date.now() >= Date.parse(position.unlockAvailableAt)) {
    return "unlockable";
  }
  if (position.bondState === "active") {
    return "locked";
  }
  if (position.bondState === "unlock_requested") {
    return "unlock_requested";
  }
  if (position.bondState === "unlockable") {
    return "unlockable";
  }
  if (position.bondState === "released") {
    return "released";
  }
  if (position.bondState === "held") {
    return "held";
  }
  if (position.bondState === "paused") {
    return "paused";
  }
  if (position.bondState === "disputed") {
    return "disputed";
  }
  return "draft";
}

function lockDaysFor(position: ProviderBondPosition) {
  if (!position.unlockAvailableAt || !position.startsAt) {
    return [];
  }
  const start = Date.parse(position.startsAt);
  const unlock = Date.parse(position.unlockAvailableAt);
  if (Number.isNaN(start) || Number.isNaN(unlock) || unlock < start) {
    return [];
  }
  return [Number(((unlock - start) / 86_400_000).toFixed(1))];
}

function latestTimestamp(values: Array<string | null | undefined>) {
  const valid = values.flatMap((value) => {
    if (!value) {
      return [];
    }
    return Number.isNaN(new Date(value).getTime()) ? [] : [value];
  });
  return valid.sort((a, b) => a.localeCompare(b)).at(-1) ?? null;
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isDateLike(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function roundOcean(value: number) {
  if (value < 1_000) {
    return Number(value.toFixed(2));
  }
  return Math.round(value / 100) * 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function queryObject(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}
