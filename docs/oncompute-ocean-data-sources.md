# Oncompute / Ocean Data Sources for Fish V0

Research date: 2026-05-31

## Scope

This note covers current public data surfaces that Fish V0 can ingest for the landing-page supply and usage dashboard. It is intentionally limited to ingestion research and API-contract recommendations. It does not change implementation files.

Fish V0 should treat Oncompute / Ocean Network data as beta, mutable, and partially undocumented. The dashboard can show useful supply and usage proof now, but it must keep strong source-state labels and avoid implying that observed prices, availability, or revenue are final billing facts.

## Source URLs Checked

Primary and live surfaces:

- https://docs.oncompute.ai/
- https://dashboard.oncompute.ai/run-job/environments
- https://dashboard.oncompute.ai/stats
- https://api.oncompute.ai/envs
- https://api.oncompute.ai/nodes
- https://api.oncompute.ai/summary
- https://api.oncompute.ai/all-summary
- https://analytics.oncompute.ai/global-stats
- https://analytics.oncompute.ai/gpu-popularity
- https://docs.oceanprotocol.com/developers/ocean-node
- https://docs.oceanprotocol.com/developers/compute-to-data/compute-workflow
- https://docs.oceanprotocol.com/developers/ocean-cli/run-c2d
- https://github.com/oceanprotocol/ocean-node/blob/develop/API.md
- https://github.com/oceanprotocol/ocean-node/blob/develop/docs/C2DV2.md
- https://docs.oceanprotocol.com/developers/old-infrastructure/provider/compute-endpoints

Secondary context:

- https://dashboard.oncompute.ai/run-node/setup
- https://nodes.oceanprotocol.com/

## Reachability Observed

Observed from this worktree on 2026-05-31:

| URL | Status | Use for Fish V0 |
| --- | --- | --- |
| `https://api.oncompute.ai/envs` | `200 application/json` | Primary supply surface. Contains nodes with nested compute environments and resources. |
| `https://api.oncompute.ai/nodes` | `200 application/json` | Node registry/status surface. Use for provider metadata, eligibility, location, uptime, version, HTTP/P2P status. |
| `https://analytics.oncompute.ai/global-stats` | `200 application/json` | Usage/revenue aggregate surface. Use for network-wide jobs and revenue with caveats. |
| `https://analytics.oncompute.ai/gpu-popularity` | `200 application/json` | GPU popularity/count surface. Use as supporting supply signal only. |
| `https://api.oncompute.ai/summary` | `404` | Do not ingest. Current `backend/ocean_supply.py` probes it, but it is not currently available. |
| `https://api.oncompute.ai/all-summary` | `404` | Do not ingest. Current `backend/ocean_supply.py` probes it, but it is not currently available. |

Direct node HTTP probes against observed IPs on port `9000` were unreliable from this environment: one timed out and one returned HTTP/0.9-like data. Fish V0 should not depend on direct node HTTP polling unless endpoints are explicitly configured and health-checked.

## Endpoint Shapes Observed

### `GET https://api.oncompute.ai/envs`

Top-level shape:

```json
{
  "envs": [
    {
      "id": "16Uiu2HAm...",
      "friendlyName": "earth-east-lithium-delta",
      "currentAddrs": ["/ip4/.../tcp/9000", "/ip4/.../tcp/9001/ws"],
      "multiaddrs": ["/ip4/.../tcp/9000"],
      "computeEnvironments": {
        "timestamp": 1778190327064,
        "environments": [
          {
            "id": "0xff1004...-0x2e308...",
            "consumerAddress": "0xf2DE...",
            "fees": {
              "8453": [
                {
                  "feeToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  "prices": [{ "price": 1, "id": "nvidia-a100-sxm4-40gb" }],
                  "total_price": 1
                }
              ]
            },
            "resources": [
              {
                "id": "nvidia-a100-sxm4-40gb",
                "type": "gpu",
                "description": "NVIDIA A100-SXM4-40GB",
                "total": 8,
                "max": 8,
                "inUse": 0,
                "memoryTotal": "40960 MiB",
                "driverVersion": "580.105.08",
                "platform": "nvidia"
              }
            ],
            "runningJobs": 0,
            "queuedJobs": 0,
            "minJobDuration": 60,
            "maxJobDuration": 180,
            "platform": { "os": "linux", "architecture": "x86_64" },
            "free": {
              "maxJobs": 3,
              "resources": [{ "id": "cpu", "max": 1 }]
            }
          }
        ]
      }
    }
  ]
}
```

Observed counts in one snapshot:

- `envs.length`: 10
- nested GPU resource rows: 18
- notable GPU/resource ids: `nvidia-a100-sxm4-40gb`, `nvidia-l40s`, `mygpu`, `red-hat-inc-virtio-gpu`, `cirrus-logic-gd-5446`, blank id, and NVML failure strings.

### `GET https://api.oncompute.ai/nodes`

Top-level shape:

```json
{
  "nodes": [
    {
      "_index": "status_v3",
      "_id": "16Uiu2HAm...",
      "_source": {
        "id": "16Uiu2HAm...",
        "friendlyName": "beer-equal-ink-two",
        "firstSeen": 1779386861562,
        "lastSeen": 1780231083652,
        "timestamp": 1780231083689,
        "eligible": false,
        "eligibilityCauseStr": "Missing escrow address for chain 8453",
        "version": "3.2.0",
        "http": true,
        "p2p": true,
        "uptime": 308542.15100000036,
        "address": "0xdaC7...",
        "currentAddrs": ["/ip4/.../tcp/9000"],
        "location": {
          "country": "United States",
          "city": "North Bergen",
          "region": "North America",
          "ip": "137.184.145.73",
          "lat": 40.7964,
          "lon": -74.0203
        },
        "escrowAddress": {
          "1": "0x...",
          "8453": null
        }
      }
    }
  ]
}
```

Use `_source` as the actual node object. Treat Elasticsearch wrapper fields as transport metadata.

### `GET https://analytics.oncompute.ai/global-stats`

Observed shape:

```json
{
  "totalNetworkRevenue": 1675.1127176547332,
  "totalBenchmarkRevenue": 4671.361220445306,
  "totalNetworkJobs": 1840,
  "totalBenchmarkJobs": 5815,
  "data": [
    {
      "epochId": 2935,
      "totalNetworkRevenue": 11.015481630032035,
      "totalBenchmarkRevenue": 0,
      "totalNetworkJobs": 89,
      "totalBenchmarkJobs": 207
    }
  ]
}
```

Use `totalNetworkJobs` and per-epoch `totalNetworkJobs` for public usage proof. Keep benchmark fields separate from paid network usage.

### `GET https://analytics.oncompute.ai/gpu-popularity`

Observed shape:

```json
[
  { "vendor": "Advanced Micro Devices, Inc.", "name": "gfx1102", "popularity": 10 },
  { "vendor": "NVIDIA Corporation", "name": "NVIDIA H200", "popularity": 8 }
]
```

This appears to be a popularity/count ranking, not available capacity. Use only as supporting context.

### Documented Ocean Provider `computeEnvironments`

The older Ocean provider docs describe:

```text
GET /api/services/computeEnvironments?chainId=8996
```

with rows like:

```json
{
  "cpuType": "AMD Ryzen 7 5800X 8-Core Processor",
  "currentJobs": 0,
  "desc": "This is a mocked environment",
  "diskGB": 2,
  "gpuType": "AMD RX570",
  "id": "ocean-compute",
  "maxJobs": 10,
  "nCPU": 2,
  "nGPU": 0,
  "priceMin": 2.3,
  "ramGB": 1
}
```

This is useful as a fallback shape but should not be treated as the current Oncompute dashboard shape.

## Fields to Trust

Trust enough for V0 display after validation:

- Node identity: `envs[].id`, `nodes[]._source.id`
- Friendly display name: `friendlyName`, with fallback to short node id
- Environment id: `computeEnvironments.environments[].id`
- Resource type: `resources[].type`
- Resource id and description: `resources[].id`, `resources[].description`
- Capacity counters: `resources[].max`, `resources[].total`, `resources[].inUse`
- Queue/job counters: `runningJobs`, `queuedJobs`, `runningfreeJobs`, `queuedFreeJobs`
- Duration bounds: `minJobDuration`, `maxJobDuration`
- Node status fields: `eligible`, `eligibilityCauseStr`, `http`, `p2p`, `version`, `lastSeen`, `uptime`
- Geographic rollup: `location.region`, `location.country`
- Analytics usage counters: `totalNetworkJobs`, `data[].totalNetworkJobs`
- Analytics revenue counters: `totalNetworkRevenue`, but only with the label "reported network revenue"

## Fields to Filter or Treat Carefully

Filter out of GPU supply:

- GPU rows with blank `id` and blank `description`.
- Virtual/display adapters such as `Red Hat, Inc. Virtio GPU` and `Cirrus Logic GD 5446`.
- Error strings such as `Failed to initialize NVML...` or `Failed to properly shut down NVML...`.
- Rows where `type === "gpu"` but `description` does not identify a real compute GPU.
- Rows with `max <= 0` unless a direct trusted endpoint later proves a different capacity field.

Treat carefully:

- `mygpu`: generic id may refer to different physical GPU models. Group by normalized description, not id alone.
- `total` vs `max`: observed dashboard cards use `max` for available units. Prefer `max` as configured capacity, fall back to `total`.
- `inUse`: useful for availability, but not a job settlement proof.
- `location.ip`, `currentAddrs`, `multiaddrs`: operational/debug fields. Do not expose full IPs in public V0 unless needed.
- `consumerAddress`, `allowedAdmins`, `address`, `escrowAddress`: useful internally, but avoid public display except shortened owner/provider ids.
- `fees`: nested by chain id and token; do not assume USD.
- `total_price`: sum of resource-unit prices in the selected fee token, not necessarily an hourly GPU price.
- Analytics revenue: may include benchmark vs network buckets; benchmark revenue should not be counted as Fish demand.

## Recommended Normalizer Rules

### Source Priority

1. `api.oncompute.ai/envs` for supply rows.
2. `api.oncompute.ai/nodes` to enrich provider/node metadata.
3. `analytics.oncompute.ai/global-stats` for usage/revenue aggregates.
4. `analytics.oncompute.ai/gpu-popularity` for supporting GPU ranking.
5. Explicitly configured direct node endpoints only after endpoint-specific health checks.
6. Static sample data when all live sources fail.

### Supply Row Normalization

Create one normalized row per `(nodeId, environmentId, resourceId, resourceDescription, feeToken, chainId)` when a real compute resource is present.

Recommended fields:

- `sourceUrl`
- `observedAt`
- `nodeId`
- `providerId`
- `providerLabel`
- `environmentId`
- `region`
- `country`
- `resourceType`
- `resourceId`
- `resourceName`
- `resourceVendor`
- `resourceMemoryGb`
- `capacity`
- `inUse`
- `available`
- `runningJobs`
- `queuedJobs`
- `minJobDurationSeconds`
- `maxJobDurationSeconds`
- `chainId`
- `feeTokenAddress`
- `feeTokenSymbol`
- `pricePerUnitMinuteToken`
- `pricePerGpuHourUsd`
- `pricingState`
- `eligibilityState`
- `rawRef`

Capacity:

- `capacity = max(resource.max, resource.total, resource.gpus, 0)`.
- `inUse = max(resource.inUse, 0)`.
- `available = max(capacity - inUse, 0)`.
- Do not synthesize `capacity = 1` for unknown GPU rows in live mode. That can overstate supply.

GPU names:

- Prefer `description`.
- Fall back to `id` only when it is a known hardware-like id.
- Normalize known variants into display names, for example `NVIDIA A100-SXM4-40GB` -> `A100 SXM4 40GB`.
- Keep raw `id` and raw `description` for traceability.

Provider grouping:

- Join `/envs` to `/nodes` by node id.
- Use `nodes[]._source.location.region` and `country` when available.
- Public provider labels should be `friendlyName || short(nodeId)`.
- Provider count should count unique node ids with at least one trusted real GPU row.

Eligibility:

- `eligible === true` should be displayed as eligible.
- `eligible === false` should not remove supply automatically, but mark the provider as `notEligible` and require extra caution before pilot routing.
- Keep `eligibilityCauseStr` internally for operator triage.

### Usage Normalization

Use `global-stats` as network-wide usage proof, not Fish-specific usage.

Recommended fields:

- `reportedNetworkJobs`
- `reportedBenchmarkJobs`
- `reportedNetworkRevenue`
- `reportedBenchmarkRevenue`
- `usageEpochs[]`
- `usageSourceState`

Fish-specific fields such as `oceanNativeJobs` and `providerPayoutUsd` must remain `0` or `sample` until Fish has its own routing and settlement records.

## Pricing Interpretation Risks

The current dashboard code and live payload imply prices are token-denominated per resource unit per minute. The UI renders strings like `token / unit / min`, `token / core / min`, `token / GB / min`, and a "From ..." total per minute across selected resources.

Risks:

- `fees[chainId][].prices[].price` is not necessarily USD.
- USDC on Base appears as `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, but token mapping must be explicit and chain-aware.
- `price: 1` under USDC means `1 USDC / unit / min` if the dashboard interpretation is correct, not `1 USD / GPU hour`.
- Older provider docs use `priceMin`; current Oncompute payloads use nested `fees`.
- Free/test environments have separate `free` resources and access rules. Do not mix free capacity with paid supply.
- Some fee rows price CPU/RAM/disk but not GPU. Fish should not infer GPU hourly pricing from non-GPU fee rows.
- A public dashboard headline like "H200 from $2.16/hr" should only be shown from a curated pricing table or a confirmed pricing API. It should not be derived from current raw `fees` without token decimals, unit semantics, and selected job resource bundle.

Recommended V0 policy:

- Show raw pricing only as `feeTokenSymbol / unit / min` when token and chain are known.
- Show `lowestUsdHr` only when the token is a trusted USD stablecoin and the unit is clearly a GPU unit.
- Otherwise set `pricingState: "unverified"` and hide hourly USD aggregates.

## Live / Sample / Snapshot State Policy

Use four states consistently:

- `live`: fetched during the current request or from a cache younger than the configured live TTL.
- `snapshot`: fetched from a stored snapshot older than live TTL but younger than the maximum stale window.
- `sample`: static demonstration data bundled in the repo.
- `unavailable`: no live, snapshot, or sample data can be shown.

Recommended TTLs:

- Supply live TTL: 5 minutes.
- Usage analytics live TTL: 15 minutes.
- Snapshot maximum age: 24 hours for public dashboard display.
- Operator/debug snapshots may be retained longer but must show `observedAt`.

State rules:

- If any primary live supply source succeeds with trusted GPU rows, `dataState = "live"`.
- If live sources respond but all GPU rows are filtered out, use `dataState = "live"` with zero trusted supply and source warnings, not sample fallback.
- If live sources fail but a persisted recent snapshot exists, `dataState = "snapshot"`.
- If no snapshot exists, use `dataState = "sample"` and clearly label it.
- Never merge sample supply into live totals.
- `sources[]` should include every attempted URL, HTTP status, timestamp, row count, trusted row count, and error message if any.

## API Contract Adjustments

The current `api/openapi.yaml` is close, but Fish V0 should adjust the contract before relying on live Oncompute data.

### `OceanSummary`

Add:

- `observedAt`: timestamp of newest source payload.
- `snapshotAgeSeconds`: number or null.
- `sourceState`: enum `live | snapshot | sample | unavailable`.
- `warnings`: array of strings.
- `usage`: object for network-wide analytics.

Keep `lastUpdated` as Fish API response generation time, not source observation time.

### `SourceResult`

Replace anonymous `sources` objects with a schema:

```yaml
SourceResult:
  type: object
  required: [name, url, state, checkedAt]
  properties:
    name: { type: string }
    url: { type: string }
    state:
      type: string
      enum: [live, snapshot, sample, unavailable]
    checkedAt: { type: string }
    httpStatus: { type: integer, nullable: true }
    rowCount: { type: integer }
    trustedRowCount: { type: integer }
    message: { type: string }
```

### `ComputeResource`

Adjust:

- Rename `total` to `capacity`, or add `capacity` and deprecate `total`.
- Add `chainId`, `feeTokenAddress`, `feeTokenSymbol`, `pricePerUnitMinuteToken`, `pricePerGpuHourUsd`, and `pricingState`.
- Add `eligibilityState`.
- Add `resourceId`, `resourceVendor`, `resourceMemoryGb`.
- Add `observedAt`.
- Add `rawSourceId` or `rawRef` instead of returning full raw payload publicly.

### `GpuSupplyRow`

Add:

- `pricingState`
- `trustedRows`
- `filteredRows`
- `sourceState`
- `observedAt`

Keep `lowestUsdHr` nullable. Do not require it.

### `ProviderScore`

Add:

- `nodeId`
- `country`
- `eligible`
- `eligibilityCause`
- `http`
- `p2p`
- `lastSeen`
- `version`
- `pricingState`

Keep `pilotEligible` as a Fish decision field, not a direct copy of Ocean eligibility.

### `/api/usage/summary`

Separate Fish usage from Ocean Network public usage:

```yaml
properties:
  dataState:
    enum: [live, snapshot, sample, unavailable]
  fish:
    type: object
    properties:
      requests: { type: integer }
      oceanNativeJobs: { type: integer }
      providerPayoutUsd: { type: number }
      creditsSpent: { type: number }
  oceanNetwork:
    type: object
    properties:
      reportedNetworkJobs: { type: integer }
      reportedBenchmarkJobs: { type: integer }
      reportedNetworkRevenue: { type: number }
      reportedBenchmarkRevenue: { type: number }
      epochs:
        type: array
        items:
          type: object
```

This prevents Fish from accidentally presenting network-wide Oncompute jobs as Fish demand.

## Implementation Notes for Existing Prototype

Current `backend/ocean_supply.py` already probes useful hosts but should be tightened:

- Remove or downgrade `https://api.oncompute.ai/summary` and `/all-summary`; both currently return 404.
- Add explicit handlers for `/envs`, `/nodes`, `analytics/global-stats`, and `analytics/gpu-popularity` instead of relying on broad recursive JSON walking.
- Stop treating every nested object that looks like a GPU as a standalone resource. The current recursive walker can pick up invalid rows and lose parent node/environment context.
- Parse `envs[].computeEnvironments.environments[]` with parent node metadata attached.
- Join `/nodes` metadata by node id.
- Filter virtual/error GPU rows before counting totals.
- Keep `fees` parsing chain-aware and token-aware.
- Do not compute `pricePerHour = price * 60` unless the fee token is known, decimals are known, and the resource price id matches the GPU row.
- Persist a last-good snapshot for `snapshot` state.

## Benchmark and Routing Implications

The current Oncompute docs frame provider competition around node performance benchmarks and leaderboards. Fish should use that as a signal for routing and public reports, but not as settlement proof. Benchmark rows need their own `benchmark` state and should stay separate from user-paid Fish jobs, provider payout events, and Ocean Network-wide analytics.

The current Ocean Compute-to-Data workflow keeps a clear job lifecycle: select a compute environment, start a job, monitor job details/status, then retrieve result references after completion. Fish benchmark and provider-job receipts should mirror that structure:

- record the selected provider/environment/model/workload;
- store an input hash or fixture id, not prompt or output text;
- store status, timing, usage, and cost estimate;
- store provider-visible result references only as hashes or redacted ids;
- sign or hash public receipts before they enter payout or scorecard totals.

For a Phase 3 scorecard, do not rank providers by raw supply alone. Use separate columns for live supply, selected-provider status, completed Fish jobs, benchmark pass rate, timeout/failure counts, verified receipt count, and payout state. This keeps the product honest while there are still few routed jobs.

## Recommended V0 Dashboard Claims

Safe:

- "Live Ocean Network supply observed from Oncompute public endpoints."
- "Trusted GPU rows after filtering."
- "Reported Ocean Network jobs and revenue from Oncompute analytics."
- "Fish-native jobs: 0 until routed through Fish."

Avoid:

- "Available GPUs" without a live/sample/snapshot badge.
- "Provider payout" from network analytics revenue.
- "USD/hour" from raw `fees` unless token and unit semantics are verified.
- Public display of provider IPs or admin addresses.
- Treating benchmark jobs as user demand.

## Open Questions

- Are `api.oncompute.ai/envs` and `api.oncompute.ai/nodes` intended as stable public APIs or internal dashboard APIs?
- What are the exact unit semantics and token decimals for `fees[chainId][].prices[]`?
- Which chain ids and fee tokens should Fish support in V0?
- Can Oncompute expose a stable snapshot endpoint with trusted GPU capacity already filtered?
- Can analytics distinguish paid user jobs, benchmark jobs, failed jobs, refunded jobs, and completed jobs?
- Are provider locations safe to publish at country/region granularity?
