import { summarizeOceanBatchJobs, type OceanBatchReceipt } from "@/lib/oceanBatch";
import type { DataState } from "@/lib/types";

type AdapterHealthPayload = {
  ok?: boolean;
  mode?: string;
  liveReady?: boolean;
  configuredForFreeCompute?: boolean;
  missing?: string[];
  warnings?: string[];
  selected?: Record<string, unknown>;
};

type AdapterConfigPayload = {
  mode?: string;
  liveReady?: boolean;
  missing?: string[];
  warnings?: string[];
  selected?: Record<string, unknown>;
};

export type OceanProofReadiness = {
  dataState: DataState;
  generatedAt: string;
  trafficReady: boolean;
  proofReady: boolean;
  claim: {
    level: "setup" | "route-ready" | "local-ocean-node" | "ocean-cli";
    title: string;
    headline: string;
    boundary: string;
    notClaimed: string[];
  };
  route: {
    batchEndpointConfigured: boolean;
    batchApiKeyConfigured: boolean;
    providerIdConfigured: boolean;
    dailyBudgetUsd: number;
  };
  adapter: {
    configured: boolean;
    reachable: boolean;
    healthState: "ok" | "error" | "not_configured";
    mode: string | null;
    liveReady: boolean;
    configuredForFreeCompute: boolean | null;
    selected: {
      nodeUrlConfigured: boolean;
      computeEnvIdConfigured: boolean;
      datasetDidsConfigured: boolean;
      algoDidConfigured: boolean;
      paymentTokenConfigured: boolean;
      resourcesConfigured: boolean;
      outputConfigured: boolean;
    };
    missing: string[];
    warnings: string[];
  };
  proof: {
    hasNonSampleReceipt: boolean;
    nonSampleJobs: number;
    latestReceiptState: DataState;
    latestReceiptAdapterMode: OceanBatchReceipt["adapterMode"] | null;
    latestReceiptAt: string | null;
    succeededJobs: number;
  };
  blockers: string[];
};

export async function summarizeOceanProofReadiness(): Promise<OceanProofReadiness> {
  const generatedAt = new Date().toISOString();
  const batchEndpoint = process.env.FISH_OCEAN_BATCH_ENDPOINT?.trim() || "";
  const batch = await summarizeOceanBatchJobs();
  const nonSampleReceipts = batch.receipts.filter((receipt) => receipt.sourceState !== "sample");
  const successfulNonSampleReceipts = nonSampleReceipts.filter((receipt) => receipt.status === "succeeded" && Boolean(receipt.hashes.outputHash));
  const latestProofReceipt = latestReceipt(successfulNonSampleReceipts);
  const hasNonSampleReceipt = Boolean(latestProofReceipt);
  const adapter = batchEndpoint ? await readAdapterStatus(batchEndpoint) : defaultAdapterStatus();
  const route = {
    batchEndpointConfigured: Boolean(batchEndpoint),
    batchApiKeyConfigured: Boolean(process.env.FISH_OCEAN_BATCH_API_KEY?.trim()),
    providerIdConfigured: Boolean(process.env.FISH_OCEAN_BATCH_PROVIDER_ID?.trim()),
    dailyBudgetUsd: readDailyBudgetUsd()
  };
  const trafficReady = route.batchEndpointConfigured && adapter.reachable && adapter.liveReady;
  const proofReady = trafficReady && hasNonSampleReceipt;
  const blockers = [
    ...(route.batchEndpointConfigured ? [] : ["FISH_OCEAN_BATCH_ENDPOINT is not configured."]),
    ...(adapter.reachable || !route.batchEndpointConfigured ? [] : ["Ocean workload adapter is not reachable from the Fish web process."]),
    ...(adapter.liveReady || !route.batchEndpointConfigured ? [] : ["Ocean workload adapter is not live-ready yet."]),
    ...(hasNonSampleReceipt ? [] : ["No successful non-sample Ocean batch receipt has been recorded yet."])
  ];

  return {
    dataState: proofReady || trafficReady || hasNonSampleReceipt ? "snapshot" : route.batchEndpointConfigured ? "unavailable" : "sample",
    generatedAt,
    trafficReady,
    proofReady,
    claim: publicClaim({
      adapterMode: adapter.mode,
      latestReceipt: latestProofReceipt,
      hasNonSampleReceipt,
      proofReady,
      trafficReady
    }),
    route,
    adapter,
    proof: {
      hasNonSampleReceipt,
      nonSampleJobs: nonSampleReceipts.length,
      latestReceiptState: latestProofReceipt?.sourceState ?? "sample",
      latestReceiptAdapterMode: latestProofReceipt?.adapterMode ?? null,
      latestReceiptAt: latestProofReceipt?.createdAt ?? null,
      succeededJobs: batch.succeededJobs
    },
    blockers
  };
}

function latestReceipt<T extends { createdAt: string }>(receipts: T[]) {
  return receipts.reduce<T | null>((latest, receipt) => (!latest || receipt.createdAt > latest.createdAt ? receipt : latest), null);
}

function publicClaim({
  adapterMode,
  latestReceipt,
  hasNonSampleReceipt,
  proofReady,
  trafficReady
}: {
  adapterMode: string | null;
  latestReceipt: OceanBatchReceipt | null;
  hasNonSampleReceipt: boolean;
  proofReady: boolean;
  trafficReady: boolean;
}): OceanProofReadiness["claim"] {
  const notClaimed = ["Paid third-party Oncompute demand", "Raw prompts or answers in public proof", "Staking alone funds compute"];
  const latestReceiptSupportsOceanHttpProof = latestReceipt?.adapterMode === "ocean_http";
  const latestReceiptIsSnapshotProof = latestReceiptSupportsOceanHttpProof && latestReceipt.sourceState === "snapshot";
  const latestReceiptIsLiveProof = latestReceiptSupportsOceanHttpProof && latestReceipt.sourceState === "live";

  if (proofReady && hasNonSampleReceipt && latestReceiptIsSnapshotProof) {
    return {
      level: "local-ocean-node",
      title: "Ocean Node proof",
      headline: "Fish can run test dishes through an Ocean Node operated by Ocean Navy.",
      boundary:
        "This proves the recorded snapshot Ocean Node path operated by Ocean Navy. It does not prove live Ocean CLI tickets or paid third-party Oncompute demand yet.",
      notClaimed
    };
  }

  if (proofReady && hasNonSampleReceipt && adapterMode === "live" && latestReceiptIsLiveProof) {
    return {
      level: "ocean-cli",
      title: "Ocean CLI proof",
      headline: "A Fish dish has an Ocean compute ticket.",
      boundary: "This proves the configured Ocean compute path for the recorded ticket. Paid third-party Oncompute demand still needs a separate external proof review.",
      notClaimed
    };
  }

  if (trafficReady) {
    return {
      level: "route-ready",
      title: "Route connected",
      headline: "The Ocean route is connected; the first proof ticket is still waiting.",
      boundary: "Fish can reach the private Ocean batch path, but public proof starts only after a successful non-sample dish receipt.",
      notClaimed
    };
  }

  return {
    level: "setup",
    title: "Setup",
    headline: "Ocean proof is still in setup mode.",
    boundary: "Fish is not claiming Ocean workload proof until the private route is ready and one successful non-sample dish ticket exists.",
    notClaimed
  };
}

async function readAdapterStatus(batchEndpoint: string): Promise<OceanProofReadiness["adapter"]> {
  const baseUrl = adapterBaseUrl(batchEndpoint);
  if (!baseUrl) {
    return {
      ...defaultAdapterStatus(),
      configured: true,
      healthState: "error",
      warnings: ["FISH_OCEAN_BATCH_ENDPOINT is not a valid URL."]
    };
  }

  try {
    const [health, config] = await Promise.all([readAdapterJson<AdapterHealthPayload>(`${baseUrl}/healthz`), readAdapterJson<AdapterConfigPayload>(`${baseUrl}/config`)]);
    const healthPayload = health.ok ? health.payload : null;
    const configPayload = config.ok ? config.payload : null;
    const selected = { ...(healthPayload?.selected ?? {}), ...(configPayload?.selected ?? {}) };
    return {
      configured: true,
      reachable: Boolean(health.ok && healthPayload?.ok),
      healthState: health.ok && healthPayload?.ok ? "ok" : "error",
      mode: stringValue(configPayload?.mode) ?? stringValue(healthPayload?.mode),
      liveReady: Boolean(configPayload?.liveReady ?? healthPayload?.liveReady),
      configuredForFreeCompute: booleanValue(healthPayload?.configuredForFreeCompute),
      selected: publicSelectedState(selected),
      missing: uniqueStrings([...(healthPayload?.missing ?? []), ...(configPayload?.missing ?? [])]),
      warnings: uniqueStrings([...(healthPayload?.warnings ?? []), ...(configPayload?.warnings ?? []), ...(health.ok ? [] : [health.error]), ...(config.ok ? [] : [config.error])])
    };
  } catch (error) {
    return {
      ...defaultAdapterStatus(),
      configured: true,
      healthState: "error",
      warnings: [error instanceof Error ? error.message : "adapter_status_failed"]
    };
  }
}

async function readAdapterJson<T>(url: string): Promise<{ ok: true; payload: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      headers: adapterHeaders(),
      signal: AbortSignal.timeout(2500)
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !payload) {
      return { ok: false, error: `adapter_${response.status}` };
    }
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "adapter_fetch_failed" };
  }
}

function adapterHeaders() {
  const apiKey = process.env.FISH_OCEAN_BATCH_API_KEY?.trim();
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function adapterBaseUrl(batchEndpoint: string) {
  try {
    const url = new URL(batchEndpoint);
    if (url.pathname.endsWith("/jobs")) {
      url.pathname = url.pathname.slice(0, -"/jobs".length) || "/";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function defaultAdapterStatus(): OceanProofReadiness["adapter"] {
  return {
    configured: false,
    reachable: false,
    healthState: "not_configured",
    mode: null,
    liveReady: false,
    configuredForFreeCompute: null,
    selected: publicSelectedState({}),
    missing: [],
    warnings: []
  };
}

function publicSelectedState(selected: Record<string, unknown>) {
  return {
    nodeUrlConfigured: Boolean(selected.nodeUrl),
    computeEnvIdConfigured: Boolean(selected.computeEnvId),
    datasetDidsConfigured: Boolean(selected.datasetDids),
    algoDidConfigured: Boolean(selected.algoDid),
    paymentTokenConfigured: Boolean(selected.paymentToken),
    resourcesConfigured: Boolean(selected.resources),
    outputConfigured: Boolean(selected.outputConfigured)
  };
}

function readDailyBudgetUsd() {
  const parsed = Number(process.env.FISH_OCEAN_BATCH_DAILY_BUDGET_USD ?? "30");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())));
}
