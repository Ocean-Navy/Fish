import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { collectProviderPilotRegistry, isProviderAllowed } from "@/lib/providerPilot";
import type { DataState } from "@/lib/types";

const PROOF_DIR = path.join(process.cwd(), "data", "proof");
const RECEIPTS_DIR = path.join(PROOF_DIR, "receipts");

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
  adapterMode: z.enum(["mock_success", "mock_failure", "mock_timeout"]).optional().default("mock_success")
});

export type ProviderJobRequestInput = z.infer<typeof jobRequestSchema>;

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
    pricingState: "prototype_estimate" | "not_applicable";
  };
  hashes: {
    inputHash: string;
    outputHash: string | null;
    canonicalReceiptHash: string;
  };
  signer: {
    keyId: string;
    algorithm: "none";
  };
  signatureStatus: "not_required";
  errorCode: string | null;
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
  receipts: ProviderJobReceipt[];
  warnings: string[];
};

export function parseProviderJobRequest(body: unknown) {
  return jobRequestSchema.safeParse(body);
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
    sourceState: "live" as DataState,
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
      algorithm: "none" as const
    },
    signatureStatus: "not_required" as const
  };

  if (!allowed || !provider) {
    const receipt = finalizeReceipt({
      ...receiptBase,
      status: "not_allowed" as const,
      completedAt: new Date().toISOString(),
      errorCode: "provider_not_allowed"
    });
    await writeReceipt(receipt);
    return { ok: false as const, status: 403, receipt, error: "provider_not_allowed" };
  }

  const outcome = runMockAdapter(input);
  const receipt = finalizeReceipt({
    ...receiptBase,
    providerJobId: outcome.status === "succeeded" ? `mock_${randomUUID()}` : null,
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
  return outcome.status === "succeeded" ? { ok: true as const, status: 200, receipt } : { ok: false as const, status: 502, receipt, error: outcome.errorCode ?? "provider_job_failed" };
}

export async function summarizeProof(): Promise<ProofSummary> {
  const [registry, receipts] = await Promise.all([collectProviderPilotRegistry(), readReceipts()]);
  const sorted = receipts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedReceipts = sorted.slice(-20).reverse();
  const succeeded = receipts.filter((receipt) => receipt.status === "succeeded");

  return {
    dataState: receipts.length ? "live" : "sample",
    lastUpdated: sorted.at(-1)?.createdAt ?? new Date().toISOString(),
    oceanJobsRouted: receipts.filter((receipt) => receipt.status !== "not_allowed").length,
    verifiedReceipts: receipts.filter((receipt) => receipt.hashes.canonicalReceiptHash).length,
    pilotProviders: registry.counts.allowed,
    providerPayoutUsd: sum(receipts.map((receipt) => receipt.cost.providerCostUsd)),
    benchmarkPassRate: receipts.length ? succeeded.length / receipts.length : null,
    oceanNativeShare: receipts.length ? receipts.filter((receipt) => receipt.backend === "ocean_provider").length / receipts.length : 0,
    failedJobs: receipts.filter((receipt) => receipt.status === "failed" || receipt.status === "not_allowed").length,
    timedOutJobs: receipts.filter((receipt) => receipt.status === "timed_out").length,
    receiptVerificationFailures: 0,
    receipts: selectedReceipts,
    warnings: receipts.length ? [] : ["No provider jobs have been routed yet. Run a selected provider smoke job to create the first receipt."]
  };
}

export async function listProviderJobReceipts() {
  const receipts = await readReceipts();
  return {
    object: "list",
    dataState: receipts.length ? "live" : "sample",
    data: receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

function runMockAdapter(input: ProviderJobRequestInput) {
  if (input.adapterMode === "mock_failure") {
    return {
      status: "failed" as const,
      outputHash: null,
      usage: { inputTokens: estimateInputTokens(input.inputRef), outputTokens: 0, gpuSeconds: 1 },
      cost: { userChargeUsd: 0, providerCostUsd: 0, pricingState: "not_applicable" as const },
      errorCode: "mock_provider_failure"
    };
  }

  if (input.adapterMode === "mock_timeout") {
    return {
      status: "timed_out" as const,
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

function finalizeReceipt(receipt: Omit<ProviderJobReceipt, "hashes"> & { hashes: Omit<ProviderJobReceipt["hashes"], "canonicalReceiptHash"> & { canonicalReceiptHash: string } }): ProviderJobReceipt {
  const withoutHash = {
    ...receipt,
    hashes: {
      inputHash: receipt.hashes.inputHash,
      outputHash: receipt.hashes.outputHash,
      canonicalReceiptHash: ""
    }
  };
  return {
    ...receipt,
    hashes: {
      ...receipt.hashes,
      canonicalReceiptHash: normalizeHash(stableStringify(withoutHash))
    }
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

function normalizeHash(value: string) {
  if (value.startsWith("sha256:") && value.length > 16) {
    return value;
  }
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
