import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";
import type { ProviderJobReceipt } from "@/lib/providerJobs";
import type { DataState } from "@/lib/types";

const PROOF_DIR = path.join(process.cwd(), "data", "proof");
const PAYOUT_EVENTS_DIR = path.join(PROOF_DIR, "payout-events");
const PAYOUT_BATCHES_DIR = path.join(PROOF_DIR, "payout-batches");

const payoutEventTypeSchema = z.enum(["job_accrued", "benchmark_stipend", "manual_adjustment", "refund", "payout_approved", "payout_paid", "payout_voided"]);
const payoutStateSchema = z.enum(["accrued", "review", "approved", "paid", "disputed", "voided"]);
const payoutBatchStateSchema = z.enum(["review", "approved", "paid", "voided"]);
const payoutQuerySchema = z
  .object({
    provider: z.string().trim().min(1).max(160).optional(),
    providerId: z.string().trim().min(1).max(160).optional(),
    state: payoutStateSchema.optional(),
    eventType: payoutEventTypeSchema.optional(),
    sourceReceiptId: z.string().trim().min(1).max(160).optional(),
    from: z.string().trim().min(1).refine(isDateLike, "from must be a valid date").optional(),
    to: z.string().trim().min(1).refine(isDateLike, "to must be a valid date").optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100)
  })
  .superRefine((query, context) => {
    if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "to must be after from"
      });
    }
  });

const payoutEventRequestSchema = z
  .object({
    providerId: z.string().trim().min(1),
    providerLabel: z.string().trim().min(1).max(120).optional(),
    sourceReceiptId: z.string().trim().min(1).max(120).optional().nullable(),
    sourceReceiptHash: z.string().trim().min(8).max(160).optional().nullable(),
    sourceSignatureStatus: z.enum(["not_required", "valid", "invalid", "missing"]).optional().nullable(),
    eventType: payoutEventTypeSchema.default("manual_adjustment"),
    amount: z.number().finite().min(-100000).max(100000).optional(),
    currency: z.string().trim().min(1).max(12).default("USD"),
    amountUsd: z.number().finite().min(-100000).max(100000),
    state: payoutStateSchema.optional(),
    operatorOwner: z.string().trim().min(1).max(120).default("operator"),
    reason: z.string().trim().min(1).max(500),
    transactionRef: z.string().trim().max(240).optional().nullable()
  })
  .superRefine((event, context) => {
    if (["job_accrued", "payout_approved", "payout_paid", "payout_voided"].includes(event.eventType) && !event.sourceReceiptId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceReceiptId"],
        message: "sourceReceiptId is required for receipt-linked payout events"
      });
    }
  });

const payoutBatchRequestSchema = z.object({
  eventIds: z.array(z.string().trim().min(1)).optional(),
  states: z.array(payoutStateSchema).min(1).optional().default(["accrued", "approved"]),
  operatorOwner: z.string().trim().min(1).max(120).default("operator"),
  reason: z.string().trim().min(1).max(500).default("Manual payout batch review")
});

export type PayoutEventType = z.infer<typeof payoutEventTypeSchema>;
export type PayoutState = z.infer<typeof payoutStateSchema>;
export type PayoutBatchState = z.infer<typeof payoutBatchStateSchema>;
export type PayoutEventRequestInput = z.infer<typeof payoutEventRequestSchema>;
export type PayoutBatchRequestInput = z.infer<typeof payoutBatchRequestSchema>;
export type PayoutQuery = z.infer<typeof payoutQuerySchema>;

export type PayoutEvent = {
  payoutEventId: string;
  providerId: string;
  providerLabel: string;
  sourceReceiptId: string | null;
  sourceReceiptHash: string | null;
  sourceSignatureStatus: ProviderJobReceipt["signatureStatus"] | null;
  eventType: PayoutEventType;
  amount: number;
  currency: string;
  amountUsd: number;
  state: PayoutState;
  visibility: "public";
  sourceState: DataState;
  operatorOwner: string;
  reason: string;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  transactionRef: string | null;
};

export type PublicPayoutEvent = Omit<PayoutEvent, "operatorOwner" | "reason" | "transactionRef"> & {
  sourceKind: "receipt" | "manual_adjustment";
  hasOperatorReason: boolean;
  hasTransactionRef: boolean;
};

export type PayoutBatch = {
  payoutBatchId: string;
  state: PayoutBatchState;
  eventIds: string[];
  providerCount: number;
  eventCount: number;
  amountUsd: number;
  currency: "USD";
  sourceState: DataState;
  visibility: "operator";
  createdAt: string;
  createdBy: string;
  reason: string;
  approvedAt: string | null;
  paidAt: string | null;
  transactionRefs: string[];
};

export type PublicPayoutBatch = Omit<PayoutBatch, "eventIds" | "createdBy" | "reason" | "transactionRefs" | "visibility"> & {
  visibility: "public";
  exportUrl: string;
  hasOperatorReason: boolean;
  hasTransactionRefs: boolean;
};

export type PayoutProviderSummary = {
  providerId: string;
  providerLabel: string;
  eventCount: number;
  receiptLinkedEvents: number;
  manualAdjustmentEvents: number;
  latestEventAt: string | null;
  totals: Record<PayoutState, number> & {
    outstandingUsd: number;
    excludedUsd: number;
  };
};

type PayoutTotals = Record<PayoutState, number> & {
  outstandingUsd: number;
  excludedUsd: number;
};

export type PublicPayoutSummary = {
  dataState: DataState;
  lastUpdated: string;
  filters: Record<string, never>;
  providerCount: null;
  eventCount: null;
  batchCount: null;
  totals: PayoutTotals;
  providerSummaries: PayoutProviderSummary[];
  events: PublicPayoutEvent[];
  batches: PublicPayoutBatch[];
  warnings: string[];
};

export type PayoutSummary = {
  dataState: DataState;
  lastUpdated: string;
  filters: PayoutQuery;
  providerCount: number;
  eventCount: number;
  batchCount: number;
  totals: PayoutTotals;
  providerSummaries: PayoutProviderSummary[];
  events: PublicPayoutEvent[];
  batches: PublicPayoutBatch[];
  warnings: string[];
};

export function parsePayoutEventRequest(body: unknown) {
  return payoutEventRequestSchema.safeParse(body);
}

export function parsePayoutBatchRequest(body: unknown) {
  return payoutBatchRequestSchema.safeParse(body);
}

export function parsePayoutQuery(searchParams: URLSearchParams) {
  return payoutQuerySchema.safeParse(queryObject(searchParams));
}

export async function recordPayoutEventForReceipt(receipt: ProviderJobReceipt) {
  if (receipt.status !== "succeeded" || receipt.cost.providerCostUsd <= 0) {
    return null;
  }
  if (receipt.sourceState === "sample" || receipt.providerJobId?.startsWith("mock_")) {
    return null;
  }

  const event: PayoutEvent = {
    payoutEventId: `pay_${shortHash(`${receipt.receiptId}:job_accrued`)}`,
    providerId: receipt.providerId,
    providerLabel: receipt.providerLabel,
    sourceReceiptId: receipt.receiptId,
    sourceReceiptHash: receipt.hashes.canonicalReceiptHash,
    sourceSignatureStatus: receipt.signatureStatus,
    eventType: "job_accrued",
    amount: receipt.cost.providerCostUsd,
    currency: "USD",
    amountUsd: receipt.cost.providerCostUsd,
    state: "accrued",
    visibility: "public",
    sourceState: receipt.sourceState,
    operatorOwner: "system",
    reason: "Provider job receipt accrued",
    createdAt: receipt.completedAt,
    approvedAt: null,
    paidAt: null,
    transactionRef: null
  };

  return writePayoutEvent(event);
}

export async function createPayoutEvent(input: PayoutEventRequestInput) {
  const providerLabel = await resolveProviderLabel(input.providerId, input.providerLabel);
  const now = new Date().toISOString();
  const state = input.state ?? defaultStateForEventType(input.eventType);
  const event: PayoutEvent = {
    payoutEventId: `pay_${randomUUID()}`,
    providerId: input.providerId,
    providerLabel,
    sourceReceiptId: input.sourceReceiptId ?? null,
    sourceReceiptHash: input.sourceReceiptHash ?? null,
    sourceSignatureStatus: input.sourceSignatureStatus ?? null,
    eventType: input.eventType,
    amount: input.amount ?? input.amountUsd,
    currency: input.currency,
    amountUsd: input.amountUsd,
    state,
    visibility: "public",
    sourceState: "live",
    operatorOwner: input.operatorOwner,
    reason: input.reason,
    createdAt: now,
    approvedAt: state === "approved" || state === "paid" ? now : null,
    paidAt: state === "paid" ? now : null,
    transactionRef: input.transactionRef ?? null
  };

  return writePayoutEvent(event);
}

export async function createPayoutBatch(input: PayoutBatchRequestInput) {
  const events = await readPayoutEvents();
  const selected = events.filter((event) => {
    if (input.eventIds?.length) {
      return input.eventIds.includes(event.payoutEventId);
    }
    return input.states.includes(event.state);
  });
  const payableEvents = selected.filter((event) => !["disputed", "voided"].includes(event.state) && event.amountUsd !== 0);
  const now = new Date().toISOString();
  const batch: PayoutBatch = {
    payoutBatchId: `batch_${randomUUID()}`,
    state: "review",
    eventIds: payableEvents.map((event) => event.payoutEventId),
    providerCount: new Set(payableEvents.map((event) => event.providerId)).size,
    eventCount: payableEvents.length,
    amountUsd: sum(payableEvents.map((event) => event.amountUsd)),
    currency: "USD",
    sourceState: sourceStateSummary(payableEvents.map((event) => event.sourceState)),
    visibility: "operator",
    createdAt: now,
    createdBy: input.operatorOwner,
    reason: input.reason,
    approvedAt: null,
    paidAt: null,
    transactionRefs: []
  };

  await mkdir(PAYOUT_BATCHES_DIR, { recursive: true });
  await writeFile(path.join(PAYOUT_BATCHES_DIR, `${batch.createdAt}-${batch.payoutBatchId}.json`.replaceAll(":", "-")), JSON.stringify(batch, null, 2));
  return batch;
}

export async function summarizePayouts(query: PayoutQuery = { limit: 100 }): Promise<PayoutSummary> {
  const { events, batches, filteredEvents, sortedEvents, sortedBatches, lastUpdated, totals } = await collectPayoutSummaryData(query);

  return {
    dataState: sourceStateSummary([...events.map((event) => event.sourceState), ...batches.map((batch) => batch.sourceState)]),
    lastUpdated: lastUpdated ?? new Date().toISOString(),
    filters: query,
    providerCount: new Set(filteredEvents.filter((event) => !["disputed", "voided"].includes(event.state)).map((event) => event.providerId)).size,
    eventCount: filteredEvents.length,
    batchCount: sortedBatches.length,
    totals,
    providerSummaries: buildProviderSummaries(filteredEvents),
    events: sortedEvents.slice(-query.limit).reverse().map(toPublicPayoutEvent),
    batches: sortedBatches.slice(-10).reverse().map(toPublicPayoutBatch),
    warnings: events.length ? (filteredEvents.length ? [] : ["No payout events match the current filters."]) : ["No provider payout events yet. Successful selected-provider jobs create accrued payout events."]
  };
}

export async function summarizePublicPayouts(): Promise<PublicPayoutSummary> {
  const { events, batches, lastUpdated, totals } = await collectPayoutSummaryData({ limit: 1 });

  return {
    dataState: sourceStateSummary([...events.map((event) => event.sourceState), ...batches.map((batch) => batch.sourceState)]),
    lastUpdated: lastUpdated ?? new Date().toISOString(),
    filters: {},
    providerCount: null,
    eventCount: null,
    batchCount: null,
    totals,
    providerSummaries: [],
    events: [],
    batches: [],
    warnings: [
      events.length ? "Public payout proof is limited to aggregate totals. Detailed payout ledgers require admin access." : "No provider payout events yet. Successful selected-provider jobs create accrued payout events."
    ]
  };
}

async function collectPayoutSummaryData(query: PayoutQuery) {
  const [events, batches] = await Promise.all([readPayoutEvents(), readPayoutBatches()]);
  const filteredEvents = filterPayoutEvents(events, query);
  const sortedEvents = filteredEvents.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sortedBatches = filterPayoutBatches(batches, filteredEvents, query).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastUpdated = [sortedEvents.at(-1)?.createdAt, sortedBatches.at(-1)?.createdAt].filter(Boolean).sort().at(-1);
  const totals = buildPayoutTotals(filteredEvents);

  return { events, batches, filteredEvents, sortedEvents, sortedBatches, lastUpdated, totals };
}

function sourceStateSummary(states: DataState[]): DataState {
  if (states.includes("live")) {
    return "live";
  }
  if (states.includes("snapshot")) {
    return "snapshot";
  }
  if (states.includes("sample")) {
    return "sample";
  }
  return "sample";
}

export async function listPayoutBatches() {
  return (await readPayoutBatches()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPayoutBatch(batchId: string) {
  const batches = await readPayoutBatches();
  return batches.find((batch) => batch.payoutBatchId === batchId) ?? null;
}

export async function exportPayoutEventsCsv(query: PayoutQuery = { limit: 500 }) {
  const events = filterPayoutEvents(await readPayoutEvents(), query).slice(0, query.limit);
  return toCsv(
    ["payoutEventId", "providerId", "providerLabel", "sourceKind", "sourceReceiptId", "eventType", "amountUsd", "currency", "state", "createdAt", "approvedAt", "paidAt", "transactionRef", "operatorOwner", "reason"],
    events.map((event) => [
      event.payoutEventId,
      event.providerId,
      event.providerLabel,
      sourceKindForEvent(event),
      event.sourceReceiptId ?? "",
      event.eventType,
      event.amountUsd,
      event.currency,
      event.state,
      event.createdAt,
      event.approvedAt ?? "",
      event.paidAt ?? "",
      event.transactionRef ?? "",
      event.operatorOwner,
      event.reason
    ])
  );
}

export async function exportPayoutBatchCsv(batchId: string) {
  const [batch, events] = await Promise.all([getPayoutBatch(batchId), readPayoutEvents()]);
  if (!batch) {
    return null;
  }

  const byId = new Map(events.map((event) => [event.payoutEventId, event]));
  const batchEvents = batch.eventIds.map((eventId) => byId.get(eventId)).filter((event): event is PayoutEvent => Boolean(event));

  return toCsv(
    ["batchId", "batchState", "batchCreatedAt", "eventId", "providerId", "providerLabel", "sourceKind", "sourceReceiptId", "eventType", "amountUsd", "currency", "state", "createdAt", "approvedAt", "paidAt", "transactionRef", "operatorOwner", "reason"],
    batchEvents.map((event) => [
      batch.payoutBatchId,
      batch.state,
      batch.createdAt,
      event.payoutEventId,
      event.providerId,
      event.providerLabel,
      sourceKindForEvent(event),
      event.sourceReceiptId ?? "",
      event.eventType,
      event.amountUsd,
      event.currency,
      event.state,
      event.createdAt,
      event.approvedAt ?? "",
      event.paidAt ?? "",
      event.transactionRef ?? "",
      event.operatorOwner,
      event.reason
    ])
  );
}

async function resolveProviderLabel(providerId: string, fallback: string | undefined) {
  if (fallback) {
    return fallback;
  }
  const registry = await collectProviderPilotRegistry();
  return registry.providers.find((provider) => provider.providerId === providerId)?.publicLabel ?? providerId;
}

async function writePayoutEvent(event: PayoutEvent) {
  await mkdir(PAYOUT_EVENTS_DIR, { recursive: true });
  const file = path.join(PAYOUT_EVENTS_DIR, `${event.payoutEventId}.json`);
  try {
    const existing = await readFile(file, "utf8");
    return JSON.parse(existing) as PayoutEvent;
  } catch {
    await writeFile(file, JSON.stringify(event, null, 2));
    return event;
  }
}

async function readPayoutEvents(): Promise<PayoutEvent[]> {
  try {
    const files = await readdir(PAYOUT_EVENTS_DIR);
    const events = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(PAYOUT_EVENTS_DIR, file), "utf8");
          return JSON.parse(raw) as PayoutEvent;
        })
    );
    return events;
  } catch {
    return [];
  }
}

async function readPayoutBatches(): Promise<PayoutBatch[]> {
  try {
    const files = await readdir(PAYOUT_BATCHES_DIR);
    const batches = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(PAYOUT_BATCHES_DIR, file), "utf8");
          return JSON.parse(raw) as PayoutBatch;
        })
    );
    return batches;
  } catch {
    return [];
  }
}

function filterPayoutEvents(events: PayoutEvent[], query: PayoutQuery) {
  return events
    .filter((event) => {
      if (query.providerId && event.providerId !== query.providerId) {
        return false;
      }
      if (query.provider) {
        const needle = query.provider.toLowerCase();
        if (!event.providerId.toLowerCase().includes(needle) && !event.providerLabel.toLowerCase().includes(needle)) {
          return false;
        }
      }
      if (query.state && event.state !== query.state) {
        return false;
      }
      if (query.eventType && event.eventType !== query.eventType) {
        return false;
      }
      if (query.sourceReceiptId && event.sourceReceiptId !== query.sourceReceiptId) {
        return false;
      }
      const createdAt = Date.parse(event.createdAt);
      if (query.from && createdAt < Date.parse(query.from)) {
        return false;
      }
      if (query.to && createdAt > Date.parse(query.to)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function filterPayoutBatches(batches: PayoutBatch[], events: PayoutEvent[], query: PayoutQuery) {
  const hasEventFilter = Boolean(query.provider || query.providerId || query.state || query.eventType || query.sourceReceiptId || query.from || query.to);
  if (!hasEventFilter) {
    return batches;
  }
  const eventIds = new Set(events.map((event) => event.payoutEventId));
  return batches.filter((batch) => batch.eventIds.some((eventId) => eventIds.has(eventId)));
}

function buildProviderSummaries(events: PayoutEvent[]): PayoutProviderSummary[] {
  const byProvider = new Map<string, PayoutEvent[]>();
  for (const event of events) {
    byProvider.set(event.providerId, [...(byProvider.get(event.providerId) ?? []), event]);
  }

  return Array.from(byProvider.entries())
    .map(([providerId, providerEvents]) => {
      const sorted = providerEvents.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        providerId,
        providerLabel: sorted.at(-1)?.providerLabel ?? providerId,
        eventCount: providerEvents.length,
        receiptLinkedEvents: providerEvents.filter((event) => event.sourceReceiptId).length,
        manualAdjustmentEvents: providerEvents.filter((event) => !event.sourceReceiptId).length,
        latestEventAt: sorted.at(-1)?.createdAt ?? null,
        totals: buildPayoutTotals(providerEvents)
      };
    })
    .sort((a, b) => b.totals.outstandingUsd - a.totals.outstandingUsd || a.providerLabel.localeCompare(b.providerLabel));
}

function defaultStateForEventType(eventType: PayoutEventType): PayoutState {
  if (eventType === "job_accrued" || eventType === "benchmark_stipend") {
    return "accrued";
  }
  if (eventType === "payout_approved") {
    return "approved";
  }
  if (eventType === "payout_paid") {
    return "paid";
  }
  if (eventType === "payout_voided") {
    return "voided";
  }
  return "review";
}

function buildPayoutTotals(events: PayoutEvent[]): PayoutSummary["totals"] {
  const states: PayoutState[] = ["accrued", "review", "approved", "paid", "disputed", "voided"];
  const byState = Object.fromEntries(states.map((state) => [state, sum(events.filter((event) => event.state === state).map((event) => event.amountUsd))])) as Record<PayoutState, number>;
  return {
    ...byState,
    outstandingUsd: sum([byState.accrued, byState.review, byState.approved]),
    excludedUsd: sum([byState.disputed, byState.voided])
  };
}

function toPublicPayoutEvent(event: PayoutEvent): PublicPayoutEvent {
  const { operatorOwner: _operatorOwner, reason, transactionRef, ...publicEvent } = event;
  return {
    ...publicEvent,
    sourceKind: sourceKindForEvent(event),
    hasOperatorReason: Boolean(reason),
    hasTransactionRef: Boolean(transactionRef)
  };
}

function toPublicPayoutBatch(batch: PayoutBatch): PublicPayoutBatch {
  const { eventIds: _eventIds, createdBy: _createdBy, reason, transactionRefs, visibility: _visibility, ...publicBatch } = batch;
  return {
    ...publicBatch,
    visibility: "public",
    exportUrl: `/api/proof/payouts/batches/${batch.payoutBatchId}/export`,
    hasOperatorReason: Boolean(reason),
    hasTransactionRefs: transactionRefs.length > 0
  };
}

function sourceKindForEvent(event: PayoutEvent): PublicPayoutEvent["sourceKind"] {
  return event.sourceReceiptId ? "receipt" : "manual_adjustment";
}

function isDateLike(value: string) {
  return Number.isFinite(Date.parse(value));
}

function queryObject(searchParams: URLSearchParams) {
  const fields = ["provider", "providerId", "state", "eventType", "sourceReceiptId", "from", "to", "limit"];
  const entries: Array<[string, string]> = [];
  for (const field of fields) {
    const value = searchParams.get(field);
    if (value && value.trim()) {
      entries.push([field, value]);
    }
  }
  return Object.fromEntries(entries);
}

function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  return `${headers.join(",")}\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(6));
}
