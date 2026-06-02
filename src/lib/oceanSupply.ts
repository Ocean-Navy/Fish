import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectProviderPilotRegistry, type ProviderPilotRegistry } from "@/lib/providerPilot";
import type {
  ComputeResource,
  DataState,
  GpuSupplyRow,
  OceanData,
  OceanSummary,
  ProviderScore,
  SourceResult
} from "@/lib/types";

const ROOT = process.cwd();
const SAMPLE_PATH = path.join(ROOT, "data", "sample_supply.json");
const NODE_ENDPOINTS_PATH = path.join(ROOT, "data", "node_endpoints.txt");
const REQUEST_TIMEOUT_MS = 8000;
const MAX_PAGES = Number(process.env.ONCOMPUTE_MAX_PAGES ?? "3");

const BASE_USDC = "0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();

type JsonRecord = Record<string, unknown>;

type NodeMetadata = {
  providerId: string;
  providerLabel: string;
  region: string;
  eligible: boolean | null;
  eligibilityCause: string | null;
  http: boolean | null;
  p2p: boolean | null;
  version: string | null;
  lastSeen: string | null;
  uptimeSeconds: number | null;
  nodeEndpoint: string;
};

const nowIso = () => new Date().toISOString();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("$", "").replace("/hr", "").replace(",", "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function pickString(row: JsonRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

function toSourceResult(name: string, state: DataState, message: string, url?: string): SourceResult {
  return { name, state, message, url };
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "FishDashboard/0.2" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPaged(url: string, listKey: "nodes" | "envs"): Promise<{ payloads: unknown[]; source: SourceResult }> {
  const payloads: unknown[] = [];
  let totalItems = 0;
  let lastMessage = "";
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pageUrl = `${url}${url.includes("?") ? "&" : "?"}page=${page}`;
    const payload = await fetchJson(pageUrl);
    payloads.push(payload);
    const rows = isRecord(payload) ? asArray(payload[listKey]) : [];
    const pagination = isRecord(payload) && isRecord(payload.pagination) ? payload.pagination : {};
    totalItems = asNumber(pagination.totalItems, totalItems);
    const totalPages = asNumber(pagination.totalPages, page);
    lastMessage = `Fetched ${rows.length} ${listKey} on page ${page}${totalItems ? ` of ${totalItems}` : ""}`;
    if (rows.length === 0 || page >= totalPages) {
      break;
    }
  }

  return {
    payloads,
    source: toSourceResult("dashboard-api", "live", lastMessage || `Fetched ${payloads.length} pages`, url)
  };
}

function normalizeNodeCandidate(value: unknown): JsonRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  if (isRecord(value._source)) {
    return value._source;
  }
  return value;
}

function nodeRowsFromPayload(payload: unknown): JsonRecord[] {
  if (!isRecord(payload)) {
    return [];
  }
  const rows = asArray(payload.nodes).length ? asArray(payload.nodes) : asArray(payload.envs);
  return rows.map(normalizeNodeCandidate).filter((row): row is JsonRecord => row !== null);
}

function nodeMetadataFromPayload(payload: unknown): NodeMetadata[] {
  return nodeRowsFromPayload(payload).map(nodeMetadataFromRow);
}

function nodeMetadataFromRow(node: JsonRecord): NodeMetadata {
  const providerId = pickString(node, ["id", "address", "friendlyName"], "unknown-provider");
  return {
    providerId,
    providerLabel: pickString(node, ["friendlyName", "address", "id"], providerId).slice(0, 42),
    region: regionForNode(node),
    eligible: asBoolean(node.eligible),
    eligibilityCause: asString(node.eligibilityCauseStr) || null,
    http: asBoolean(node.http),
    p2p: asBoolean(node.p2p),
    version: asString(node.version) || null,
    lastSeen: timestampToIso(node.lastSeen ?? node.timestamp),
    uptimeSeconds: Number.isFinite(asNumber(node.uptime, Number.NaN)) ? asNumber(node.uptime, 0) : null,
    nodeEndpoint: asString(asArray(node.currentAddrs)[0], "")
  };
}

function invalidGpuDescription(description: string): boolean {
  const value = description.toLowerCase();
  return (
    !value ||
    value.includes("failed to") ||
    value.includes("virtio") ||
    value.includes("cirrus") ||
    value.includes("blocked by the operating system")
  );
}

function isGpuResource(resource: JsonRecord): boolean {
  const type = asString(resource.type).toLowerCase();
  const description = pickString(resource, ["description", "name", "id"]);
  if (type !== "gpu") {
    return false;
  }
  if (invalidGpuDescription(description)) {
    return false;
  }
  const lower = description.toLowerCase();
  return /(nvidia|geforce|rtx|a100|h100|h200|l40|a6000|amd|radeon|mi300|gfx)/i.test(lower);
}

function priceForResource(environment: JsonRecord, resourceId: string): { value: number | null; feeToken: string; basis: ComputeResource["priceBasis"] } {
  const fees = isRecord(environment.fees) ? environment.fees : {};
  for (const feeGroup of Object.values(fees)) {
    for (const fee of asArray(feeGroup)) {
      if (!isRecord(fee)) {
        continue;
      }
      const feeToken = asString(fee.feeToken, "unknown");
      for (const price of asArray(fee.prices)) {
        if (!isRecord(price)) {
          continue;
        }
        if (asString(price.id) === resourceId) {
          const value = asNumber(price.price, Number.NaN);
          return {
            value: Number.isFinite(value) ? value : null,
            feeToken,
            basis: feeToken.toLowerCase() === BASE_USDC ? "configured_fee" : "unknown"
          };
        }
      }
    }
  }

  return { value: null, feeToken: "unknown", basis: "unknown" };
}

function regionForNode(node: JsonRecord): string {
  const location = isRecord(node.location) ? node.location : {};
  return pickString(location, ["region", "country", "city"], "unknown");
}

function timestampToIso(value: unknown): string | null {
  const timestamp = asNumber(value, Number.NaN);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(milliseconds).toISOString();
}

function normalizeNodeResources(node: JsonRecord, source: ComputeResource["source"], endpointUrl: string): ComputeResource[] {
  const providerId = pickString(node, ["id", "address", "friendlyName"], "unknown-provider");
  const providerLabel = pickString(node, ["friendlyName", "address", "id"], providerId).slice(0, 42);
  const region = regionForNode(node);
  const computeEnvironments = isRecord(node.computeEnvironments) ? node.computeEnvironments : {};
  const environments = asArray(computeEnvironments.environments).filter(isRecord);
  const timestamp = nowIso();
  const nodeEndpoint = endpointUrl || asString(asArray(node.currentAddrs)[0], "");

  return environments.flatMap((environment) => {
    const resources = asArray(environment.resources).filter(isRecord);
    return resources.filter(isGpuResource).map((resource) => {
      const resourceId = pickString(resource, ["id"], "gpu");
      const resourceName = pickString(resource, ["description", "name", "id"], "GPU");
      const total = asNumber(resource.total, asNumber(resource.max, 1));
      const inUse = asNumber(resource.inUse, 0);
      const available = Math.max(total - inUse, 0);
      const price = priceForResource(environment, resourceId);
      const environmentId = pickString(environment, ["id"], "unknown-env");

      return {
        snapshotId: `${timestamp}:${providerId}:${environmentId}:${resourceId}`,
        timestamp,
        source,
        providerId,
        providerLabel,
        nodeEndpoint,
        environmentId,
        region,
        resourceType: "gpu",
        resourceName,
        total,
        inUse,
        available,
        feeToken: price.feeToken,
        pricePerMinute: null,
        pricePerHour: null,
        listedPrice: price.value,
        priceBasis: price.basis,
        minJobDuration: asNumber(environment.minJobDuration, Number.NaN) || null,
        maxJobDuration: asNumber(environment.maxJobDuration, Number.NaN) || null,
        runningJobs: asNumber(environment.runningJobs, 0),
        status: available > 0 ? "available" : total > 0 ? "busy" : "unknown",
        raw: { node, environment, resource }
      } satisfies ComputeResource;
    });
  });
}

function dedupeResources(resources: ComputeResource[]): ComputeResource[] {
  const seen = new Map<string, ComputeResource>();
  for (const resource of resources) {
    const key = [
      resource.providerId,
      resource.environmentId,
      resource.resourceName,
      resource.total,
      resource.inUse,
      resource.listedPrice ?? "none"
    ].join("|");
    if (!seen.has(key)) {
      seen.set(key, resource);
    }
  }
  return Array.from(seen.values());
}

async function readNodeEndpoints(): Promise<string[]> {
  try {
    const raw = await readFile(NODE_ENDPOINTS_PATH, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/\/$/, ""));
  } catch {
    return [];
  }
}

async function fetchDirectNode(endpoint: string): Promise<{ resources: ComputeResource[]; source: SourceResult }> {
  const url = `${endpoint}/api/services/computeEnvironments`;
  try {
    const payload = await fetchJson(url);
    const node = {
      id: endpoint,
      friendlyName: endpoint,
      currentAddrs: [endpoint],
      computeEnvironments: isRecord(payload) && Array.isArray(payload.environments) ? payload : { environments: payload }
    };
    const resources = normalizeNodeResources(node, "direct-node", endpoint);
    return {
      resources,
      source: toSourceResult("direct-node", "live", `Fetched ${resources.length} normalized GPU resources`, url)
    };
  } catch (error) {
    return {
      resources: [],
      source: toSourceResult("direct-node", "unavailable", error instanceof Error ? error.message : "Fetch failed", url)
    };
  }
}

async function loadSample(): Promise<OceanSummary> {
  const raw = await readFile(SAMPLE_PATH, "utf8");
  const parsed = JSON.parse(raw) as OceanSummary;
  return {
    ...parsed,
    dataState: "sample",
    lastUpdated: nowIso(),
    sourceCount: parsed.sources?.length ?? 1,
    warnings: [
      "Showing static sample data because live Oncompute/Ocean resources were unavailable.",
      ...(parsed.warnings ?? [])
    ]
  };
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function summarize(resources: ComputeResource[], sources: SourceResult[], analytics: JsonRecord | null, nodeMetadata: Map<string, NodeMetadata>, providerPilot: ProviderPilotRegistry): OceanSummary {
  const grouped = new Map<string, ComputeResource[]>();
  for (const resource of resources) {
    const key = resource.resourceName;
    grouped.set(key, [...(grouped.get(key) ?? []), resource]);
  }

  const gpuSupply: GpuSupplyRow[] = Array.from(grouped.entries())
    .map(([gpu, rows]) => {
      const usdHrPrices = rows.map((row) => row.pricePerHour).filter((value): value is number => value !== null);
      const listedPrices = rows.map((row) => row.listedPrice).filter((value): value is number => value !== null);
      return {
        gpu,
        total: rows.reduce((sum, row) => sum + row.total, 0),
        available: rows.reduce((sum, row) => sum + row.available, 0),
        providers: new Set(rows.map((row) => row.providerId)).size,
        lowestUsdHr: usdHrPrices.length ? Math.min(...usdHrPrices) : null,
        medianUsdHr: median(usdHrPrices),
        lowestListedPrice: listedPrices.length ? Math.min(...listedPrices) : null,
        regions: Array.from(new Set(rows.map((row) => row.region).filter(Boolean))).sort()
      };
    })
    .sort((a, b) => b.available - a.available);

  const byProvider = new Map<string, ComputeResource[]>();
  for (const resource of resources) {
    byProvider.set(resource.providerId, [...(byProvider.get(resource.providerId) ?? []), resource]);
  }

  const providers: ProviderScore[] = Array.from(byProvider.entries())
    .map(([providerId, rows]) => {
      const listedPrices = rows.map((row) => row.listedPrice).filter((value): value is number => value !== null);
      const usdHrPrices = rows.map((row) => row.pricePerHour).filter((value): value is number => value !== null);
      const availableGpus = rows.reduce((sum, row) => sum + row.available, 0);
      const node = nodeMetadata.get(providerId);
      const pilotProfile = providerPilot.providers.find((provider) => provider.providerId === providerId);
      const allowlist = providerPilot.allowlist.find((entry) => entry.providerId === providerId);
      const selected = Boolean(allowlist || pilotProfile?.pilotStatus === "allowed");
      const nodeStatus: ProviderScore["nodeStatus"] = node?.eligible === true ? "eligible" : node?.eligible === false ? "not_eligible" : "unknown";
      const fishReadyStatus = fishReadyStatusForProvider({
        availableGpus,
        selected,
        readinessComplete: Boolean(pilotProfile && pilotProfile.readiness.readyCount === pilotProfile.readiness.totalCount)
      });
      return {
        providerId,
        label: node?.providerLabel ?? pilotProfile?.publicLabel ?? rows[0]?.providerLabel ?? providerId,
        region: node?.region ?? pilotProfile?.region ?? rows[0]?.region ?? "unknown",
        gpuTypes: Array.from(new Set(rows.map((row) => row.resourceName))).sort(),
        availableGpus,
        lowestUsdHr: usdHrPrices.length ? Math.min(...usdHrPrices) : null,
        lowestListedPrice: listedPrices.length ? Math.min(...listedPrices) : null,
        uptime7d: node?.uptimeSeconds ? Math.min(1, node.uptimeSeconds / (7 * 24 * 60 * 60)) : null,
        benchmarkStatus: selected ? "selected for benchmark" : "needs benchmark",
        pilotEligible: availableGpus > 0 && node?.eligible !== false,
        nodeStatus,
        fishReadyStatus,
        nodeHttp: node?.http ?? null,
        nodeP2p: node?.p2p ?? null,
        nodeVersion: node?.version ?? null,
        lastSeen: node?.lastSeen ?? null,
        readinessLabel: pilotProfile?.readiness.label ?? null,
        verified: selected
      };
    })
    .sort((a, b) => b.availableGpus - a.availableGpus);

  const h200Prices = resources
    .filter((row) => row.resourceName.toLowerCase().includes("h200"))
    .map((row) => row.pricePerHour)
    .filter((value): value is number => value !== null);
  const listedPrices = resources.map((row) => row.listedPrice).filter((value): value is number => value !== null);

  const totalNetworkJobs = asNumber(analytics?.totalNetworkJobs, 0);
  const totalBenchmarkJobs = asNumber(analytics?.totalBenchmarkJobs, 0);
  const totalNetworkRevenue = Number.isFinite(asNumber(analytics?.totalNetworkRevenue, Number.NaN))
    ? asNumber(analytics?.totalNetworkRevenue, 0)
    : null;

  return {
    dataState: "live",
    lastUpdated: nowIso(),
    sources,
    sourceCount: sources.filter((source) => source.state === "live").length,
    kpis: {
      totalGpus: resources.reduce((sum, row) => sum + row.total, 0),
      availableGpus: resources.reduce((sum, row) => sum + row.available, 0),
      providerCount: byProvider.size,
      eligibleNodeCount: providers.filter((provider) => provider.nodeStatus === "eligible").length,
      fishReadyProviderCount: providers.filter((provider) => provider.fishReadyStatus === "ready" || provider.fishReadyStatus === "selected").length,
      h200FromUsdHr: h200Prices.length ? Math.min(...h200Prices) : null,
      lowestListedGpuFee: listedPrices.length ? Math.min(...listedPrices) : null,
      oceanNativeJobs: totalNetworkJobs,
      benchmarkJobs: totalBenchmarkJobs,
      providerPayoutUsd: null,
      networkRevenueUsd: totalNetworkRevenue
    },
    gpuSupply,
    providers,
    warnings: [
      "Live Oncompute fee fields are shown as listed configured fees until price basis is confirmed.",
      "Virtual GPUs and known NVML error rows are filtered out of public supply metrics.",
      ...(providerPilot.allowlist.length ? [] : ["No Fish selected-provider allowlist is configured yet. Supply rows are candidates, not routed providers."])
    ]
  };
}

function fishReadyStatusForProvider(input: { availableGpus: number; selected: boolean; readinessComplete: boolean }): ProviderScore["fishReadyStatus"] {
  if (input.readinessComplete) {
    return "ready";
  }
  if (input.selected) {
    return "selected";
  }
  if (input.availableGpus > 0) {
    return "candidate";
  }
  return "needs_review";
}

export async function collectOceanData(): Promise<OceanData> {
  const sources: SourceResult[] = [];
  const resources: ComputeResource[] = [];
  const nodeMetadata = new Map<string, NodeMetadata>();
  let analytics: JsonRecord | null = null;
  const providerPilot = await collectProviderPilotRegistry();

  for (const [url, key] of [
    [process.env.ONCOMPUTE_NODES_URL ?? "https://api.oncompute.ai/nodes", "nodes"],
    [process.env.ONCOMPUTE_ENVS_URL ?? "https://api.oncompute.ai/envs", "envs"]
  ] as const) {
    try {
      const result = await fetchPaged(url, key);
      sources.push(result.source);
      for (const payload of result.payloads) {
        for (const node of nodeMetadataFromPayload(payload)) {
          nodeMetadata.set(node.providerId, node);
        }
        for (const node of nodeRowsFromPayload(payload)) {
          resources.push(...normalizeNodeResources(node, "dashboard-api", url));
        }
      }
    } catch (error) {
      sources.push(toSourceResult("dashboard-api", "unavailable", error instanceof Error ? error.message : "Fetch failed", url));
    }
  }

  const statsUrl = process.env.ONCOMPUTE_STATS_URL ?? "https://analytics.oncompute.ai/global-stats";
  try {
    const payload = await fetchJson(statsUrl);
    if (isRecord(payload)) {
      analytics = payload;
    }
    sources.push(toSourceResult("analytics-api", "live", "Fetched global network stats", statsUrl));
  } catch (error) {
    sources.push(toSourceResult("analytics-api", "unavailable", error instanceof Error ? error.message : "Fetch failed", statsUrl));
  }

  const directEndpoints = await readNodeEndpoints();
  for (const endpoint of directEndpoints) {
    const result = await fetchDirectNode(endpoint);
    sources.push(result.source);
    resources.push(...result.resources);
  }

  const normalized = dedupeResources(resources);
  if (normalized.length > 0) {
    return {
      summary: summarize(normalized, sources, analytics, nodeMetadata, providerPilot),
      resources: normalized
    };
  }

  const sample = await loadSample();
  return {
    summary: {
      ...sample,
      sources: [...sources, ...(sample.sources ?? [])],
      sourceCount: sources.filter((source) => source.state === "live").length
    },
    resources: []
  };
}
