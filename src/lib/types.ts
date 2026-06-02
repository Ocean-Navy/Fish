export type DataState = "live" | "snapshot" | "sample" | "unavailable";

export type SourceResult = {
  name: string;
  state: DataState;
  message: string;
  url?: string;
};

export type ComputeResource = {
  snapshotId: string;
  timestamp: string;
  source: "dashboard-api" | "analytics-api" | "direct-node" | "sample";
  providerId: string;
  providerLabel: string;
  nodeEndpoint: string;
  environmentId: string;
  region: string;
  resourceType: "gpu" | "cpu" | "ram" | "disk" | "unknown";
  resourceName: string;
  total: number;
  inUse: number;
  available: number;
  feeToken: string;
  pricePerMinute: number | null;
  pricePerHour: number | null;
  listedPrice: number | null;
  priceBasis: "configured_fee" | "sample_usd_hr" | "unknown";
  minJobDuration: number | null;
  maxJobDuration: number | null;
  runningJobs: number | null;
  status: "available" | "busy" | "unknown";
  raw: unknown;
};

export type GpuSupplyRow = {
  gpu: string;
  total: number;
  available: number;
  providers: number;
  lowestUsdHr: number | null;
  medianUsdHr: number | null;
  lowestListedPrice: number | null;
  regions: string[];
};

export type ProviderScore = {
  providerId: string;
  label: string;
  region: string;
  gpuTypes: string[];
  availableGpus: number;
  lowestUsdHr: number | null;
  lowestListedPrice: number | null;
  uptime7d: number | null;
  benchmarkStatus: string;
  pilotEligible: boolean;
  nodeStatus: "eligible" | "not_eligible" | "unknown";
  fishReadyStatus: "ready" | "selected" | "candidate" | "needs_review";
  nodeHttp: boolean | null;
  nodeP2p: boolean | null;
  nodeVersion: string | null;
  lastSeen: string | null;
  readinessLabel: string | null;
  verified?: boolean;
};

export type OceanSummary = {
  dataState: DataState;
  lastUpdated: string;
  sources: SourceResult[];
  sourceCount: number;
  kpis: {
    totalGpus: number;
    availableGpus: number;
    providerCount: number;
    eligibleNodeCount: number;
    fishReadyProviderCount: number;
    h200FromUsdHr: number | null;
    lowestListedGpuFee: number | null;
    oceanNativeJobs: number;
    benchmarkJobs: number;
    providerPayoutUsd: number | null;
    networkRevenueUsd: number | null;
  };
  gpuSupply: GpuSupplyRow[];
  providers: ProviderScore[];
  warnings: string[];
};

export type OceanData = {
  summary: OceanSummary;
  resources: ComputeResource[];
};
