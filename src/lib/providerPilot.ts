import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { DataState } from "@/lib/types";

const SUBMISSIONS_DIR = path.join(process.cwd(), "data", "submissions");
const ALLOWLIST_PATH = path.join(process.cwd(), "data", "provider_allowlist.json");

const submissionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  createdAt: z.string(),
  body: z.object({
    contact: z.string().optional().default(""),
    nodeEndpoint: z.string().optional().default(""),
    gpuType: z.string().optional().default(""),
    region: z.string().optional().default(""),
    payoutPreference: z.string().optional().default(""),
    notes: z.string().optional().default("")
  })
});

const allowlistFileSchema = z.object({
  providers: z
    .array(
      z.object({
        providerId: z.string().optional(),
        sourceApplicationId: z.string().optional(),
        nodeEndpoint: z.string().optional(),
        jobEndpoint: z.string().optional(),
        allowedWorkloadTypes: z.array(z.string()).optional().default(["chat_batch"]),
        allowedModels: z.array(z.string()).optional().default(["fish-demo-chat"]),
        maxConcurrentJobs: z.number().int().positive().optional().default(1),
        maxDailySpendUsd: z.number().positive().optional().default(5),
        benchmarkRequired: z.boolean().optional().default(true),
        operatorOwner: z.string().optional().default("unassigned"),
        decisionReason: z.string().optional().default("Manual pilot allowlist"),
        startsAt: z.string().optional(),
        expiresAt: z.string().optional()
      })
    )
    .optional()
    .default([])
});

export type ProviderPilotStatus = "applied" | "contacted" | "verified" | "allowed" | "probation" | "paused" | "rejected" | "exited";

export type ProviderProfile = {
  providerId: string;
  displayName: string;
  sourceApplicationId: string | null;
  nodeEndpointHash: string | null;
  region: string;
  gpuTypes: string[];
  capacitySummary: string;
  pilotStatus: ProviderPilotStatus;
  publicLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderAllowlistEntry = {
  providerId: string;
  allowedWorkloadTypes: string[];
  allowedModels: string[];
  maxConcurrentJobs: number;
  maxDailySpendUsd: number;
  benchmarkRequired: boolean;
  operatorOwner: string;
  decisionReason: string;
  startsAt: string;
  expiresAt: string | null;
};

export type ProviderPilotRegistry = {
  dataState: DataState;
  lastUpdated: string;
  counts: {
    applications: number;
    applied: number;
    allowed: number;
    paused: number;
    rejected: number;
  };
  providers: ProviderProfile[];
  allowlist: ProviderAllowlistEntry[];
  warnings: string[];
};

export type ProviderPilotOperatorExport = {
  exportedAt: string;
  rows: Array<{
    providerId: string;
    sourceApplicationId: string;
    pilotStatus: ProviderPilotStatus;
    contact: string;
    nodeEndpoint: string;
    nodeEndpointHash: string | null;
    gpuType: string;
    region: string;
    payoutPreference: string;
    notes: string;
    publicLabel: string;
    createdAt: string;
  }>;
};

type AllowlistCandidate = z.infer<typeof allowlistFileSchema>["providers"][number];

export async function collectProviderPilotRegistry(): Promise<ProviderPilotRegistry> {
  const [submissions, allowlistCandidates] = await Promise.all([readProviderSubmissions(), readAllowlistCandidates()]);
  const providers = submissions.map((submission) => buildProviderProfile(submission));
  const allowlist = buildAllowlist(providers, allowlistCandidates);
  const allowedProviderIds = new Set(allowlist.map((entry) => entry.providerId));
  const publicProviders = providers.map((provider) => ({
    ...provider,
    pilotStatus: allowedProviderIds.has(provider.providerId) ? ("allowed" as const) : provider.pilotStatus
  }));

  return {
    dataState: publicProviders.length || allowlist.length ? "live" : "sample",
    lastUpdated: new Date().toISOString(),
    counts: {
      applications: publicProviders.length,
      applied: publicProviders.filter((provider) => provider.pilotStatus === "applied").length,
      allowed: publicProviders.filter((provider) => provider.pilotStatus === "allowed").length,
      paused: publicProviders.filter((provider) => provider.pilotStatus === "paused").length,
      rejected: publicProviders.filter((provider) => provider.pilotStatus === "rejected").length
    },
    providers: publicProviders,
    allowlist,
    warnings:
      publicProviders.length === 0
        ? ["No provider applications found yet. Provider registry will populate from /api/providers/apply submissions."]
        : allowlist.length === 0
          ? ["Provider applications exist, but no selected provider allowlist is configured yet."]
          : []
  };
}

export function isProviderAllowed(registry: ProviderPilotRegistry, providerId: string, workloadType: string, model: string) {
  const entry = registry.allowlist.find((candidate) => candidate.providerId === providerId);
  if (!entry) {
    return false;
  }
  return entry.allowedWorkloadTypes.includes(workloadType) && entry.allowedModels.includes(model);
}

export async function resolveProviderJobEndpoint(providerId: string) {
  const envEndpoint = readProviderJobEndpointEnv(providerId);
  if (envEndpoint) {
    return envEndpoint;
  }

  const [submissions, allowlistCandidates] = await Promise.all([readProviderSubmissions(), readAllowlistCandidates()]);
  const providers = submissions.map((submission) => buildProviderProfile(submission));
  for (const candidate of allowlistCandidates) {
    const provider = findCandidateProvider(providers, candidate);
    if (provider?.providerId === providerId && candidate.jobEndpoint?.trim()) {
      return candidate.jobEndpoint.trim();
    }
  }
  return null;
}

export async function collectProviderPilotOperatorExport(): Promise<ProviderPilotOperatorExport> {
  const registry = await collectProviderPilotRegistry();
  const submissions = await readProviderSubmissions();
  const byApplicationId = new Map(registry.providers.map((provider) => [provider.sourceApplicationId, provider]));

  return {
    exportedAt: new Date().toISOString(),
    rows: submissions.flatMap((submission) => {
      const provider = byApplicationId.get(submission.id);
      if (!provider) {
        return [];
      }

      return [
        {
          providerId: provider.providerId,
          sourceApplicationId: submission.id,
          pilotStatus: provider.pilotStatus,
          contact: submission.body.contact,
          nodeEndpoint: submission.body.nodeEndpoint,
          nodeEndpointHash: provider.nodeEndpointHash,
          gpuType: submission.body.gpuType,
          region: submission.body.region,
          payoutPreference: submission.body.payoutPreference,
          notes: submission.body.notes,
          publicLabel: provider.publicLabel,
          createdAt: submission.createdAt
        }
      ];
    })
  };
}

async function readProviderSubmissions() {
  try {
    const files = await readdir(SUBMISSIONS_DIR);
    const submissions = await Promise.all(
      files
        .filter((file) => file.startsWith("provider-") && file.endsWith(".json"))
        .map(async (file) => {
          const raw = await readFile(path.join(SUBMISSIONS_DIR, file), "utf8");
          return submissionSchema.safeParse(JSON.parse(raw));
        })
    );
    return submissions.filter((parsed) => parsed.success).map((parsed) => parsed.data);
  } catch {
    return [];
  }
}

async function readAllowlistCandidates(): Promise<AllowlistCandidate[]> {
  const fromFile = await readAllowlistFile();
  const fromEnv = readAllowlistEnv();
  return [...fromFile, ...fromEnv];
}

async function readAllowlistFile(): Promise<AllowlistCandidate[]> {
  try {
    const raw = await readFile(ALLOWLIST_PATH, "utf8");
    const parsed = allowlistFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.providers : [];
  } catch {
    return [];
  }
}

function readAllowlistEnv(): AllowlistCandidate[] {
  return (process.env.FISH_PROVIDER_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((providerId) => ({
      providerId,
      allowedWorkloadTypes: ["chat_batch"],
      allowedModels: ["fish-demo-chat"],
      maxConcurrentJobs: 1,
      maxDailySpendUsd: 5,
      benchmarkRequired: true,
      operatorOwner: "env",
      decisionReason: "FISH_PROVIDER_ALLOWLIST"
    }));
}

function readProviderJobEndpointEnv(providerId: string) {
  return (process.env.FISH_PROVIDER_JOB_ENDPOINTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1) {
        return [];
      }
      return [
        {
          providerId: entry.slice(0, separator).trim(),
          endpoint: entry.slice(separator + 1).trim()
        }
      ];
    })
    .find((entry) => entry.providerId === providerId && entry.endpoint)?.endpoint ?? null;
}

function buildProviderProfile(submission: z.infer<typeof submissionSchema>): ProviderProfile {
  const providerId = providerIdForSubmission(submission);
  const gpuTypes = splitList(submission.body.gpuType);
  const region = submission.body.region || "Review needed";

  return {
    providerId,
    displayName: displayNameForSubmission(submission, providerId),
    sourceApplicationId: submission.id,
    nodeEndpointHash: submission.body.nodeEndpoint ? shortHash(submission.body.nodeEndpoint) : null,
    region,
    gpuTypes,
    capacitySummary: gpuTypes.length ? gpuTypes.join(", ") : "GPU details pending",
    pilotStatus: "applied",
    publicLabel: `${providerId.slice(0, 10)}-${region.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "review"}`,
    createdAt: submission.createdAt,
    updatedAt: submission.createdAt
  };
}

function buildAllowlist(providers: ProviderProfile[], candidates: AllowlistCandidate[]): ProviderAllowlistEntry[] {
  return candidates.flatMap((candidate) => {
    const provider = findCandidateProvider(providers, candidate);
    if (!provider) {
      return [];
    }

    return [
      {
        providerId: provider.providerId,
        allowedWorkloadTypes: candidate.allowedWorkloadTypes,
        allowedModels: candidate.allowedModels,
        maxConcurrentJobs: candidate.maxConcurrentJobs,
        maxDailySpendUsd: candidate.maxDailySpendUsd,
        benchmarkRequired: candidate.benchmarkRequired,
        operatorOwner: candidate.operatorOwner,
        decisionReason: candidate.decisionReason,
        startsAt: candidate.startsAt ?? new Date().toISOString(),
        expiresAt: candidate.expiresAt ?? null
      }
    ];
  });
}

function findCandidateProvider(providers: ProviderProfile[], candidate: AllowlistCandidate) {
  if (candidate.providerId) {
    return providers.find((provider) => provider.providerId === candidate.providerId);
  }
  if (candidate.sourceApplicationId) {
    return providers.find((provider) => provider.sourceApplicationId === candidate.sourceApplicationId);
  }
  if (candidate.nodeEndpoint) {
    const endpointHash = shortHash(candidate.nodeEndpoint);
    return providers.find((provider) => provider.nodeEndpointHash === endpointHash);
  }
  return undefined;
}

function providerIdForSubmission(submission: z.infer<typeof submissionSchema>) {
  return `prov_${shortHash([submission.id, submission.body.nodeEndpoint, submission.body.contact].filter(Boolean).join(":"))}`;
}

function displayNameForSubmission(submission: z.infer<typeof submissionSchema>, providerId: string) {
  const host = safeHost(submission.body.nodeEndpoint);
  if (host && !isIpLike(host)) {
    return host.split(".").slice(0, 2).join(".");
  }
  return `Provider ${providerId.slice(-6)}`;
}

function splitList(value: string) {
  return value
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function safeHost(value: string) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function isIpLike(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
