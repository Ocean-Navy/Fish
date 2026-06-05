import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { collectProviderPilotRegistry, isProviderAllowed, resolveProviderJobEndpoint } from "@/lib/providerPilot";
import { recordPayoutEventForReceipt, summarizePublicPayouts } from "@/lib/providerPayouts";
import type { PublicPayoutSummary } from "@/lib/providerPayouts";
import type { DataState } from "@/lib/types";

const PROOF_DIR = path.join(process.cwd(), "data", "proof");
const RECEIPTS_DIR = path.join(PROOF_DIR, "receipts");
const SIGNING_KEY_PATH = path.join(PROOF_DIR, "signing-key.json");

const jobRequestSchema = z.object({
  providerId: z.string().trim().min(1),
  workloadType: z.string().trim().min(1).default("chat_batch"),
  model: z.string().trim().min(1).default("fish-demo-chat"),
  inputRef: z.string().trim().min(8).max(160),
  parameters: z
    .object({
      maxOutputTokens: z.number().int().min(1).max(4096).optional().default(256),
      temperature: z.number().min(0).max(2).optional().default(0.2)
    })
    .optional()
    .default({ maxOutputTokens: 256, temperature: 0.2 }),
  maxRuntimeSeconds: z.number().int().min(1).max(600).optional().default(60),
  maxCostUsd: z.number().min(0).max(100).optional().default(1),
  adapterMode: z.enum(["mock_success", "mock_failure", "mock_timeout", "provider_http"]).optional().default("mock_success")
});

const providerSmokeRequestSchema = z.object({
  providerId: z.string().trim().min(1),
  workloadType: z.string().trim().min(1).default("chat_batch"),
  model: z.string().trim().min(1).default("fish-demo-chat"),
  adapterMode: z.enum(["mock_success", "mock_failure", "mock_timeout", "provider_http"]).optional(),
  maxRuntimeSeconds: z.number().int().min(1).max(120).optional().default(30),
  maxCostUsd: z.number().min(0).max(5).optional().default(0.25),
  parameters: z
    .object({
      maxOutputTokens: z.number().int().min(1).max(1024).optional().default(64),
      temperature: z.number().min(0).max(2).optional().default(0.1)
    })
    .optional()
    .default({ maxOutputTokens: 64, temperature: 0.1 })
});

const signingKeySchema = z.object({
  keyId: z.string(),
  algorithm: z.literal("ed25519"),
  publicKeyPem: z.string(),
  privateKeyPem: z.string(),
  createdAt: z.string()
});

export type ProviderJobRequestInput = z.infer<typeof jobRequestSchema>;
export type ProviderSmokeRequestInput = z.infer<typeof providerSmokeRequestSchema>;

type ProofSigningKey = z.infer<typeof signingKeySchema>;

export type ProviderJobReceipt = {
  receiptVersion: 1;
  receiptType: "provider_job_receipt";
  receiptId: string;
  jobId: string;
  providerJobId: string | null;
  providerId: string;
  providerLabel: string;
  model: string;
  workloadType: string;
  backend: "ocean_provider";
  status: "succeeded" | "failed" | "timed_out" | "not_allowed";
  sourceState: DataState;
  visibility: "public";
  createdAt: string;
  startedAt: string;
  completedAt: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    gpuSeconds: number;
  };
  cost: {
    userChargeUsd: number;
    providerCostUsd: number;
    pricingState: "prototype_estimate" | "provider_verified" | "not_applicable";
  };
  hashes: {
    inputHash: string;
    outputHash: string | null;
    canonicalReceiptHash: string;
  };
  signer: {
    keyId: string;
    algorithm: "none" | "ed25519";
    publicKeyPem: string | null;
  };
  signatureStatus: "not_required" | "valid" | "invalid" | "missing";
  signature: string | null;
  errorCode: string | null;
};

export type ReceiptVerification = {
  ok: boolean;
  status: ProviderJobReceipt["signatureStatus"];
  receiptId: string;
  canonicalReceiptHash: string;
  error: string | null;
};

type ProviderAdapterOutcome = {
  status: "succeeded" | "failed" | "timed_out";
  providerJobId: string | null;
  outputHash: string | null;
  usage: ProviderJobReceipt["usage"];
  cost: ProviderJobReceipt["cost"];
  errorCode: string | null;
};

const receiptStatusSchema = z.enum(["succeeded", "failed", "timed_out", "not_allowed"]);
const receiptSignatureStatusSchema = z.enum(["not_required", "valid", "invalid", "missing"]);
const receiptLedgerQuerySchema = z
  .object({
    provider: z.string().trim().min(1).max(160).optional(),
    providerId: z.string().trim().min(1).max(160).optional(),
    status: receiptStatusSchema.optional(),
    backend: z.literal("ocean_provider").optional(),
    receiptType: z.literal("provider_job_receipt").optional(),
    signatureStatus: receiptSignatureStatusSchema.optional(),
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

export type ReceiptLedgerQuery = z.infer<typeof receiptLedgerQuerySchema>;

export type ReceiptLedgerItem = {
  receiptId: string;
  receiptType: ProviderJobReceipt["receiptType"];
  jobId: string;
  providerLabel: string;
  model: string;
  workloadType: string;
  backend: ProviderJobReceipt["backend"];
  status: ProviderJobReceipt["status"];
  sourceState: DataState;
  usageSummary: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    gpuSeconds: number;
  };
  costSummary: ProviderJobReceipt["cost"];
  signatureStatus: ProviderJobReceipt["signatureStatus"];
  signatureVerified: boolean;
  signatureError: string | null;
  canonicalReceiptHash: string;
  createdAt: string;
  completedAt: string;
  detailUrl: string;
};

export type PublicReceiptDetail = {
  object: "provider_job_receipt";
  receiptId: string;
  receiptType: ProviderJobReceipt["receiptType"];
  jobId: string;
  providerLabel: string;
  model: string;
  workloadType: string;
  backend: ProviderJobReceipt["backend"];
  status: ProviderJobReceipt["status"];
  sourceState: DataState;
  visibility: ProviderJobReceipt["visibility"];
  timestamps: {
    createdAt: string;
    startedAt: string;
    completedAt: string;
  };
  usage: ReceiptLedgerItem["usageSummary"];
  cost: ProviderJobReceipt["cost"];
  hashes: {
    canonicalReceiptHash: string;
    computedCanonicalReceiptHash: string;
    inputHashPrefix: string;
    outputHashPrefix: string | null;
  };
  signer: {
    keyId: string;
    algorithm: ProviderJobReceipt["signer"]["algorithm"];
  };
  signature: {
    status: ProviderJobReceipt["signatureStatus"];
    verified: boolean;
    error: string | null;
  };
  errorCode: string | null;
};

export type ReceiptLedgerResponse = {
  object: "list";
  dataState: DataState;
  filters: ReceiptLedgerQuery;
  count: number;
  totalCount: number;
  verificationFailures: number;
  data: ReceiptLedgerItem[];
};

export type ProofSummary = {
  dataState: DataState;
  lastUpdated: string;
  oceanJobsRouted: number;
  verifiedReceipts: number;
  pilotProviders: number;
  providerPayoutUsd: number;
  benchmarkPassRate: number | null;
  oceanNativeShare: number;
  failedJobs: number;
  timedOutJobs: number;
  receiptVerificationFailures: number;
  payouts: PublicPayoutSummary;
  receipts: ProviderJobReceipt[];
  warnings: string[];
};

export function parseProviderJobRequest(body: unknown) {
  return jobRequestSchema.safeParse(body);
}

export function parseProviderSmokeRequest(body: unknown) {
  return providerSmokeRequestSchema.safeParse(body);
}

export function parseReceiptLedgerQuery(searchParams: URLSearchParams) {
  return receiptLedgerQuerySchema.safeParse(queryObject(searchParams));
}

export async function runProviderSmokeJob(input: ProviderSmokeRequestInput) {
  const adapterMode = input.adapterMode ?? ((await resolveProviderJobEndpoint(input.providerId)) ? "provider_http" : "mock_success");
  const inputRef = smokeInputRef(input);
  const result = await runProviderJob({
    providerId: input.providerId,
    workloadType: input.workloadType,
    model: input.model,
    inputRef,
    parameters: input.parameters,
    maxRuntimeSeconds: input.maxRuntimeSeconds,
    maxCostUsd: input.maxCostUsd,
    adapterMode
  });
  return {
    ...result,
    smoke: {
      inputRef,
      adapterMode,
      storesPromptOutputText: false
    }
  };
}

export async function runProviderJob(input: ProviderJobRequestInput) {
  const registry = await collectProviderPilotRegistry();
  const provider = registry.providers.find((candidate) => candidate.providerId === input.providerId);
  const allowed = isProviderAllowed(registry, input.providerId, input.workloadType, input.model);

  const startedAt = new Date().toISOString();
  const receiptBase = {
    receiptVersion: 1 as const,
    receiptType: "provider_job_receipt" as const,
    receiptId: `rcpt_${randomUUID()}`,
    jobId: `job_${randomUUID()}`,
    providerJobId: null as string | null,
    providerId: input.providerId,
    providerLabel: provider?.publicLabel ?? "unknown-provider",
    model: input.model,
    workloadType: input.workloadType,
    backend: "ocean_provider" as const,
    sourceState: sourceStateForAdapter(input),
    visibility: "public" as const,
    createdAt: startedAt,
    startedAt,
    usage: {
      inputTokens: estimateInputTokens(input.inputRef),
      outputTokens: 0,
      gpuSeconds: 0
    },
    cost: {
      userChargeUsd: 0,
      providerCostUsd: 0,
      pricingState: "not_applicable" as const
    },
    hashes: {
      inputHash: normalizeHash(input.inputRef),
      outputHash: null as string | null,
      canonicalReceiptHash: ""
    },
    signer: {
      keyId: "fish-proof-none-v1",
      algorithm: "none" as const,
      publicKeyPem: null
    },
    signatureStatus: "not_required" as const,
    signature: null
  };

  if (!allowed || !provider) {
    const receipt = await finalizeReceipt({
      ...receiptBase,
      status: "not_allowed" as const,
      completedAt: new Date().toISOString(),
      errorCode: "provider_not_allowed"
    });
    await writeReceipt(receipt);
    const payoutEvent = await recordPayoutEventForReceipt(receipt);
    return { ok: false as const, status: 403, receipt, payoutEvent, error: "provider_not_allowed" };
  }

  const outcome = input.adapterMode === "provider_http" ? await runProviderHttpAdapter(input, receiptBase.jobId) : runMockAdapter(input);
  const receipt = await finalizeReceipt({
    ...receiptBase,
    providerJobId: outcome.providerJobId,
    status: outcome.status,
    completedAt: new Date().toISOString(),
    usage: outcome.usage,
    cost: outcome.cost,
    hashes: {
      ...receiptBase.hashes,
      outputHash: outcome.outputHash
    },
    errorCode: outcome.errorCode
  });

  await writeReceipt(receipt);
  const payoutEvent = await recordPayoutEventForReceipt(receipt);
  return outcome.status === "succeeded" ? { ok: true as const, status: 200, receipt, payoutEvent } : { ok: false as const, status: 502, receipt, payoutEvent, error: outcome.errorCode ?? "provider_job_failed" };
}

export async function summarizeProof(): Promise<ProofSummary> {
  const [registry, receipts, payouts] = await Promise.all([collectProviderPilotRegistry(), readReceipts(), summarizePublicPayouts()]);
  const sorted = receipts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedReceipts = sorted.slice(-20).reverse();
  const proofReceipts = receipts.filter(isProofEvidenceReceipt);
  const succeeded = proofReceipts.filter((receipt) => receipt.status === "succeeded");
  const verifications = proofReceipts.map((receipt) => verifyProviderJobReceipt(receipt));
  const verificationFailures = verifications.filter((verification) => !verification.ok).length;

  return {
    dataState: sourceStateSummary(receipts.map(effectiveReceiptSourceState)),
    lastUpdated: sorted.at(-1)?.createdAt ?? new Date().toISOString(),
    oceanJobsRouted: proofReceipts.filter((receipt) => receipt.status !== "not_allowed").length,
    verifiedReceipts: verifications.filter((verification) => verification.ok).length,
    pilotProviders: registry.counts.allowed,
    providerPayoutUsd: payouts.totals.outstandingUsd,
    benchmarkPassRate: proofReceipts.length ? succeeded.length / proofReceipts.length : null,
    oceanNativeShare: proofReceipts.length ? proofReceipts.filter((receipt) => receipt.backend === "ocean_provider").length / proofReceipts.length : 0,
    failedJobs: proofReceipts.filter((receipt) => receipt.status === "failed" || receipt.status === "not_allowed").length,
    timedOutJobs: proofReceipts.filter((receipt) => receipt.status === "timed_out").length,
    receiptVerificationFailures: verificationFailures,
    payouts,
    receipts: selectedReceipts,
    warnings: [
      ...(receipts.length ? [] : ["No provider jobs have been routed yet. Run a selected provider smoke job to create the first receipt."]),
      ...(receipts.length && proofReceipts.length === 0 ? ["Only sample provider proof exists. Run a non-mock selected-provider job before claiming live Ocean proof."] : []),
      ...(verificationFailures ? [`${verificationFailures} provider job receipt signature check failed.`] : [])
    ]
  };
}

export async function listProviderJobReceipts() {
  const receipts = await readReceipts();
  return {
    object: "list",
    dataState: sourceStateSummary(receipts.map(effectiveReceiptSourceState)),
    data: receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(withEffectiveSourceState)
  };
}

export async function listProviderJobReceiptLedger(query: ReceiptLedgerQuery): Promise<ReceiptLedgerResponse> {
  const receipts = await readReceipts();
  const filtered = filterReceipts(receipts, query);
  const selected = filtered.slice(0, query.limit);
  return {
    object: "list",
    dataState: sourceStateSummary(receipts.map(effectiveReceiptSourceState)),
    filters: query,
    count: selected.length,
    totalCount: filtered.length,
    verificationFailures: selected.filter((receipt) => !verifyProviderJobReceipt(receipt).ok).length,
    data: selected.map(toReceiptLedgerItem)
  };
}

export async function getProviderJobReceiptDetail(receiptId: string): Promise<PublicReceiptDetail | null> {
  const receipts = await readReceipts();
  const receipt = receipts.find((candidate) => candidate.receiptId === receiptId);
  return receipt ? toPublicReceiptDetail(receipt) : null;
}

export async function exportProviderJobReceiptsJson(query: ReceiptLedgerQuery) {
  const receipts = await readReceipts();
  const selected = filterReceipts(receipts, query).slice(0, query.limit);
  return {
    object: "receipt_ledger_export",
    dataState: sourceStateSummary(receipts.map(effectiveReceiptSourceState)),
    filters: query,
    count: selected.length,
    data: selected.map(toOperatorReceiptExport)
  };
}

export async function exportProviderJobReceiptsCsv(query: ReceiptLedgerQuery) {
  const receipts = await readReceipts();
  const selected = filterReceipts(receipts, query).slice(0, query.limit);
  return toCsv(
    [
      "receiptId",
      "receiptType",
      "jobId",
      "providerId",
      "providerJobId",
      "providerLabel",
      "model",
      "workloadType",
      "backend",
      "status",
      "sourceState",
      "createdAt",
      "startedAt",
      "completedAt",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "gpuSeconds",
      "userChargeUsd",
      "providerCostUsd",
      "pricingState",
      "inputHashPrefix",
      "outputHashPrefix",
      "canonicalReceiptHash",
      "signatureStatus",
      "signatureVerified",
      "signatureError",
      "keyId",
      "algorithm",
      "errorCode"
    ],
    selected.map((receipt) => {
      const verification = verifyProviderJobReceipt(receipt);
      return [
        receipt.receiptId,
        receipt.receiptType,
        receipt.jobId,
        receipt.providerId,
        receipt.providerJobId ?? "",
        receipt.providerLabel,
        receipt.model,
        receipt.workloadType,
        receipt.backend,
        receipt.status,
        effectiveReceiptSourceState(receipt),
        receipt.createdAt,
        receipt.startedAt,
        receipt.completedAt,
        receipt.usage.inputTokens,
        receipt.usage.outputTokens,
        receipt.usage.inputTokens + receipt.usage.outputTokens,
        receipt.usage.gpuSeconds,
        receipt.cost.userChargeUsd,
        receipt.cost.providerCostUsd,
        receipt.cost.pricingState,
        hashPrefix(receipt.hashes.inputHash),
        receipt.hashes.outputHash ? hashPrefix(receipt.hashes.outputHash) : "",
        receipt.hashes.canonicalReceiptHash,
        receipt.signatureStatus,
        verification.ok ? "yes" : "no",
        verification.error ?? "",
        receipt.signer.keyId,
        receipt.signer.algorithm,
        receipt.errorCode ?? ""
      ];
    })
  );
}

export function verifyProviderJobReceipt(receipt: ProviderJobReceipt): ReceiptVerification {
  const canonicalReceiptHash = hashReceipt(receipt);
  if (canonicalReceiptHash !== receipt.hashes.canonicalReceiptHash) {
    return {
      ok: false,
      status: "invalid",
      receiptId: receipt.receiptId,
      canonicalReceiptHash,
      error: "canonical_receipt_hash_mismatch"
    };
  }

  if (receipt.signatureStatus === "not_required" || receipt.signer.algorithm === "none") {
    return {
      ok: true,
      status: "not_required",
      receiptId: receipt.receiptId,
      canonicalReceiptHash,
      error: null
    };
  }

  if (!receipt.signature || !receipt.signer.publicKeyPem) {
    return {
      ok: false,
      status: "missing",
      receiptId: receipt.receiptId,
      canonicalReceiptHash,
      error: "signature_missing"
    };
  }

  try {
    const publicKey = createPublicKey(receipt.signer.publicKeyPem);
    const valid = verify(null, Buffer.from(canonicalReceiptHash), publicKey, Buffer.from(receipt.signature, "base64"));
    return {
      ok: valid,
      status: valid ? "valid" : "invalid",
      receiptId: receipt.receiptId,
      canonicalReceiptHash,
      error: valid ? null : "signature_invalid"
    };
  } catch {
    return {
      ok: false,
      status: "invalid",
      receiptId: receipt.receiptId,
      canonicalReceiptHash,
      error: "signature_verification_error"
    };
  }
}

function runMockAdapter(input: ProviderJobRequestInput): ProviderAdapterOutcome {
  if (input.adapterMode === "mock_failure") {
    return {
      status: "failed" as const,
      providerJobId: null,
      outputHash: null,
      usage: { inputTokens: estimateInputTokens(input.inputRef), outputTokens: 0, gpuSeconds: 1 },
      cost: { userChargeUsd: 0, providerCostUsd: 0, pricingState: "not_applicable" as const },
      errorCode: "mock_provider_failure"
    };
  }

  if (input.adapterMode === "mock_timeout") {
    return {
      status: "timed_out" as const,
      providerJobId: null,
      outputHash: null,
      usage: { inputTokens: estimateInputTokens(input.inputRef), outputTokens: 0, gpuSeconds: input.maxRuntimeSeconds },
      cost: { userChargeUsd: 0, providerCostUsd: 0, pricingState: "not_applicable" as const },
      errorCode: "mock_provider_timeout"
    };
  }

  const outputHash = normalizeHash(`mock-output:${input.providerId}:${input.model}:${input.inputRef}`);
  const outputTokens = Math.min(input.parameters.maxOutputTokens, 128);
  const providerCostUsd = Number(Math.min(input.maxCostUsd, 0.01 + outputTokens * 0.00002).toFixed(6));
  const userChargeUsd = Number((providerCostUsd * 1.25).toFixed(6));

  return {
    status: "succeeded" as const,
    providerJobId: `mock_${randomUUID()}`,
    outputHash,
    usage: {
      inputTokens: estimateInputTokens(input.inputRef),
      outputTokens,
      gpuSeconds: Math.min(input.maxRuntimeSeconds, 3)
    },
    cost: {
      userChargeUsd,
      providerCostUsd,
      pricingState: "prototype_estimate" as const
    },
    errorCode: null
  };
}

async function runProviderHttpAdapter(input: ProviderJobRequestInput, jobId: string): Promise<ProviderAdapterOutcome> {
  const endpoint = await resolveProviderJobEndpoint(input.providerId);
  if (!endpoint) {
    return providerAdapterFailure(input, "provider_job_endpoint_not_configured");
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: providerJobHeaders(),
      body: JSON.stringify({
        jobId,
        idempotencyKey: jobId,
        providerId: input.providerId,
        workloadType: input.workloadType,
        model: input.model,
        inputRef: input.inputRef,
        parameters: input.parameters,
        maxRuntimeSeconds: input.maxRuntimeSeconds,
        maxCostUsd: input.maxCostUsd
      }),
      signal: AbortSignal.timeout(Math.min(input.maxRuntimeSeconds * 1000, Number(process.env.FISH_PROVIDER_JOB_TIMEOUT_MS ?? "600000")))
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      return providerAdapterFailure(input, response.status === 504 ? "provider_job_timeout" : "provider_job_http_error", response.status === 504 ? "timed_out" : "failed");
    }
    return providerAdapterOutcome(input, payload);
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return providerAdapterFailure(input, timeout ? "provider_job_timeout" : "provider_job_http_error", timeout ? "timed_out" : "failed");
  }
}

function providerAdapterOutcome(input: ProviderJobRequestInput, payload: Record<string, unknown>): ProviderAdapterOutcome {
  const status = readProviderStatus(payload);
  const providerCostUsd = readProviderCostUsd(payload);
  if (providerCostUsd > input.maxCostUsd) {
    return providerAdapterFailure(input, "provider_cost_cap_exceeded");
  }
  if (status !== "succeeded") {
    return {
      ...providerAdapterFailure(input, readString(payload, ["errorCode"]) ?? "provider_job_failed", status),
      providerJobId: readString(payload, ["providerJobId"]) ?? readString(payload, ["jobId"])
    };
  }

  const outputHash = readResultHash(payload);
  if (!outputHash) {
    return providerAdapterFailure(input, "provider_output_hash_missing");
  }

  return {
    status,
    providerJobId: readString(payload, ["providerJobId"]) ?? readString(payload, ["jobId"]),
    outputHash,
    usage: readProviderUsage(input, payload),
    cost: {
      userChargeUsd: Number((providerCostUsd * 1.25).toFixed(6)),
      providerCostUsd,
      pricingState: "provider_verified" as const
    },
    errorCode: null
  };
}

function providerAdapterFailure(input: ProviderJobRequestInput, errorCode: string, status: "failed" | "timed_out" = "failed"): ProviderAdapterOutcome {
  return {
    status,
    providerJobId: null as string | null,
    outputHash: null,
    usage: { inputTokens: estimateInputTokens(input.inputRef), outputTokens: 0, gpuSeconds: status === "timed_out" ? input.maxRuntimeSeconds : 1 },
    cost: { userChargeUsd: 0, providerCostUsd: 0, pricingState: "not_applicable" as const },
    errorCode
  };
}

function providerJobHeaders() {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  const apiKey = process.env.FISH_PROVIDER_JOB_API_KEY?.trim();
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function readProviderStatus(payload: Record<string, unknown>): ProviderAdapterOutcome["status"] {
  const status = readString(payload, ["status"]);
  if (status === "succeeded" || status === "failed" || status === "timed_out") {
    return status;
  }
  return "failed";
}

function readProviderUsage(input: ProviderJobRequestInput, payload: Record<string, unknown>) {
  return {
    inputTokens: Math.max(1, Math.round(readNumber(payload, ["usage", "inputTokens"]) ?? estimateInputTokens(input.inputRef))),
    outputTokens: Math.max(0, Math.round(readNumber(payload, ["usage", "outputTokens"]) ?? 0)),
    gpuSeconds: Math.max(1, Math.round(readNumber(payload, ["usage", "gpuSeconds"]) ?? 1))
  };
}

function readProviderCostUsd(payload: Record<string, unknown>) {
  const currency = readString(payload, ["cost", "currency"])?.toUpperCase();
  const amount = readNumber(payload, ["cost", "providerCostUsd"]) ?? readNumber(payload, ["cost", "amount"]) ?? 0;
  return currency && !["USD", "USDC"].includes(currency) ? 0 : Number(Math.max(0, amount).toFixed(6));
}

function readResultHash(payload: Record<string, unknown>) {
  const hash = readString(payload, ["outputHash"]) ?? readString(payload, ["outputRef"]);
  return hash ? normalizeHash(hash) : null;
}

function sourceStateForAdapter(input: ProviderJobRequestInput): DataState {
  return input.adapterMode.startsWith("mock_") ? "sample" : "snapshot";
}

function effectiveReceiptSourceState(receipt: ProviderJobReceipt): DataState {
  if (receipt.providerJobId?.startsWith("mock_") || receipt.errorCode?.startsWith("mock_")) {
    return "sample";
  }
  return receipt.sourceState;
}

function withEffectiveSourceState(receipt: ProviderJobReceipt): ProviderJobReceipt {
  const sourceState = effectiveReceiptSourceState(receipt);
  return sourceState === receipt.sourceState ? receipt : { ...receipt, sourceState };
}

function isProofEvidenceReceipt(receipt: ProviderJobReceipt) {
  const sourceState = effectiveReceiptSourceState(receipt);
  return sourceState === "live" || sourceState === "snapshot";
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

function filterReceipts(receipts: ProviderJobReceipt[], query: ReceiptLedgerQuery) {
  return receipts
    .filter((receipt) => {
      if (query.providerId && receipt.providerId !== query.providerId) {
        return false;
      }
      if (query.provider) {
        const needle = query.provider.toLowerCase();
        const label = receipt.providerLabel.toLowerCase();
        const providerId = receipt.providerId.toLowerCase();
        if (!label.includes(needle) && !providerId.includes(needle)) {
          return false;
        }
      }
      if (query.status && receipt.status !== query.status) {
        return false;
      }
      if (query.backend && receipt.backend !== query.backend) {
        return false;
      }
      if (query.receiptType && receipt.receiptType !== query.receiptType) {
        return false;
      }
      if (query.signatureStatus && receipt.signatureStatus !== query.signatureStatus) {
        return false;
      }
      const createdAt = Date.parse(receipt.createdAt);
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

function toReceiptLedgerItem(receipt: ProviderJobReceipt): ReceiptLedgerItem {
  const verification = verifyProviderJobReceipt(receipt);
  return {
    receiptId: receipt.receiptId,
    receiptType: receipt.receiptType,
    jobId: receipt.jobId,
    providerLabel: receipt.providerLabel,
    model: receipt.model,
    workloadType: receipt.workloadType,
    backend: receipt.backend,
    status: receipt.status,
    sourceState: effectiveReceiptSourceState(receipt),
    usageSummary: {
      inputTokens: receipt.usage.inputTokens,
      outputTokens: receipt.usage.outputTokens,
      totalTokens: receipt.usage.inputTokens + receipt.usage.outputTokens,
      gpuSeconds: receipt.usage.gpuSeconds
    },
    costSummary: receipt.cost,
    signatureStatus: receipt.signatureStatus,
    signatureVerified: verification.ok,
    signatureError: verification.error,
    canonicalReceiptHash: receipt.hashes.canonicalReceiptHash,
    createdAt: receipt.createdAt,
    completedAt: receipt.completedAt,
    detailUrl: `/api/proof/receipts/${receipt.receiptId}`
  };
}

function toPublicReceiptDetail(receipt: ProviderJobReceipt): PublicReceiptDetail {
  const verification = verifyProviderJobReceipt(receipt);
  return {
    object: "provider_job_receipt",
    receiptId: receipt.receiptId,
    receiptType: receipt.receiptType,
    jobId: receipt.jobId,
    providerLabel: receipt.providerLabel,
    model: receipt.model,
    workloadType: receipt.workloadType,
    backend: receipt.backend,
    status: receipt.status,
    sourceState: effectiveReceiptSourceState(receipt),
    visibility: receipt.visibility,
    timestamps: {
      createdAt: receipt.createdAt,
      startedAt: receipt.startedAt,
      completedAt: receipt.completedAt
    },
    usage: {
      inputTokens: receipt.usage.inputTokens,
      outputTokens: receipt.usage.outputTokens,
      totalTokens: receipt.usage.inputTokens + receipt.usage.outputTokens,
      gpuSeconds: receipt.usage.gpuSeconds
    },
    cost: receipt.cost,
    hashes: {
      canonicalReceiptHash: receipt.hashes.canonicalReceiptHash,
      computedCanonicalReceiptHash: verification.canonicalReceiptHash,
      inputHashPrefix: hashPrefix(receipt.hashes.inputHash),
      outputHashPrefix: receipt.hashes.outputHash ? hashPrefix(receipt.hashes.outputHash) : null
    },
    signer: {
      keyId: receipt.signer.keyId,
      algorithm: receipt.signer.algorithm
    },
    signature: {
      status: receipt.signatureStatus,
      verified: verification.ok,
      error: verification.error
    },
    errorCode: receipt.errorCode
  };
}

function toOperatorReceiptExport(receipt: ProviderJobReceipt) {
  const verification = verifyProviderJobReceipt(receipt);
  return {
    ...toPublicReceiptDetail(receipt),
    providerId: receipt.providerId,
    providerJobId: receipt.providerJobId,
    hashes: {
      ...toPublicReceiptDetail(receipt).hashes,
      inputHash: receipt.hashes.inputHash,
      outputHash: receipt.hashes.outputHash
    },
    signature: {
      ...toPublicReceiptDetail(receipt).signature,
      rawSignaturePresent: Boolean(receipt.signature),
      verificationError: verification.error
    }
  };
}

async function finalizeReceipt(receipt: Omit<ProviderJobReceipt, "hashes"> & { hashes: Omit<ProviderJobReceipt["hashes"], "canonicalReceiptHash"> & { canonicalReceiptHash: string } }): Promise<ProviderJobReceipt> {
  const signingKey = await readOrCreateSigningKey();
  const signedReceipt = {
    ...receipt,
    signer: {
      keyId: signingKey.keyId,
      algorithm: signingKey.algorithm,
      publicKeyPem: signingKey.publicKeyPem
    },
    signatureStatus: "valid" as const
  };
  const canonicalReceiptHash = hashReceipt(signedReceipt);
  const privateKey = createPrivateKey(signingKey.privateKeyPem);
  const signature = sign(null, Buffer.from(canonicalReceiptHash), privateKey).toString("base64");

  return {
    ...signedReceipt,
    hashes: {
      ...signedReceipt.hashes,
      canonicalReceiptHash
    },
    signature
  };
}

function hashReceipt(receipt: ProviderJobReceipt | Omit<ProviderJobReceipt, "signature">): string {
  const { signature: _signature, ...withoutSignature } = receipt as ProviderJobReceipt;
  const withoutHash = {
    ...withoutSignature,
    hashes: {
      inputHash: receipt.hashes.inputHash,
      outputHash: receipt.hashes.outputHash,
      canonicalReceiptHash: ""
    }
  };
  return normalizeHash(stableStringify(withoutHash));
}

async function readOrCreateSigningKey(): Promise<ProofSigningKey> {
  try {
    const raw = await readFile(SIGNING_KEY_PATH, "utf8");
    const parsed = signingKeySchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // First run creates a local prototype signing key in the ignored proof volume.
  }

  const generated = generateSigningKey();
  await mkdir(PROOF_DIR, { recursive: true });
  await writeFile(SIGNING_KEY_PATH, JSON.stringify(generated, null, 2), { mode: 0o600 });
  return generated;
}

function generateSigningKey(): ProofSigningKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  return {
    keyId: `fish-proof-ed25519-${shortHash(publicKeyPem)}`,
    algorithm: "ed25519",
    publicKeyPem,
    privateKeyPem,
    createdAt: new Date().toISOString()
  };
}

async function writeReceipt(receipt: ProviderJobReceipt) {
  await mkdir(RECEIPTS_DIR, { recursive: true });
  await writeFile(path.join(RECEIPTS_DIR, `${receipt.createdAt}-${receipt.receiptId}.json`.replaceAll(":", "-")), JSON.stringify(receipt, null, 2));
}

async function readReceipts(): Promise<ProviderJobReceipt[]> {
  try {
    const files = await readdir(RECEIPTS_DIR);
    const receipts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(RECEIPTS_DIR, file), "utf8");
          return JSON.parse(raw) as ProviderJobReceipt;
        })
    );
    return receipts;
  } catch {
    return [];
  }
}

function estimateInputTokens(inputRef: string) {
  return Math.max(1, Math.ceil(inputRef.length / 4));
}

function smokeInputRef(input: ProviderSmokeRequestInput) {
  return normalizeHash(["provider-smoke-v1", input.providerId, input.workloadType, input.model].join(":"));
}

function normalizeHash(value: string) {
  if (value.startsWith("sha256:") && value.length > 16) {
    return value;
  }
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashPrefix(hash: string) {
  return hash.length > 24 ? `${hash.slice(0, 24)}...` : hash;
}

function isDateLike(value: string) {
  return Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: Record<string, unknown>, path: string[]) {
  const result = readPath(value, path);
  return typeof result === "string" && result.trim() ? result.trim() : null;
}

function readNumber(value: Record<string, unknown>, path: string[]) {
  const result = readPath(value, path);
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

function readPath(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function queryObject(searchParams: URLSearchParams) {
  const fields = ["provider", "providerId", "status", "backend", "receiptType", "signatureStatus", "from", "to", "limit"];
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(6));
}
