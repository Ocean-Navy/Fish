import assert from "node:assert/strict";
import { test } from "node:test";
import { toPublicComputeResource } from "./publicOceanResources";
import type { ComputeResource } from "./types";

test("public compute resource payload omits private endpoint and raw fields", () => {
  const resource: ComputeResource = {
    snapshotId: "snapshot-1",
    timestamp: "2026-06-05T00:00:00.000Z",
    source: "direct-node",
    providerId: "direct-node-private",
    providerLabel: "Direct Ocean node private",
    nodeEndpoint: "http://127.0.0.1:18181/operator/secret-node-token",
    environmentId: "env-1",
    region: "unknown",
    resourceType: "gpu",
    resourceName: "NVIDIA H200",
    total: 1,
    inUse: 0,
    available: 1,
    feeToken: "unknown",
    pricePerMinute: null,
    pricePerHour: null,
    listedPrice: null,
    priceBasis: "unknown",
    minJobDuration: null,
    maxJobDuration: null,
    runningJobs: 0,
    status: "available",
    raw: { secret: "private raw node payload" }
  };

  const payload = toPublicComputeResource(resource) as Record<string, unknown>;

  assert.equal("nodeEndpoint" in payload, false);
  assert.equal("raw" in payload, false);
  assert.equal(payload.providerId, "direct-node-private");
  assert.equal(payload.resourceName, "NVIDIA H200");
});
