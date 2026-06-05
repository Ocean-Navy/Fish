# Dashboard Specification: Ocean Network Usage and Supply

## Purpose

The dashboard proves Fish is not only a visual concept. It should show live or recently collected data about Ocean Network supply, usage, provider availability, and eventually OCEAN utility.

## Dashboard principle

If data is not live, label it clearly.

Every metric must have one of these states:

- `live`
- `snapshot`
- `sample`
- `unavailable`

Never present sample numbers as live network facts.

## V0 dashboard scope

### Data sources

The backend should attempt, in order:

1. Public Oncompute / Ocean Network dashboard APIs where reachable.
2. Direct Ocean Node compute environment endpoints, if provided.
3. Cached local snapshots.
4. Sample data fallback.

### Direct Ocean Node endpoint

For known nodes, try:

```text
GET {nodeEndpoint}/api/services/computeEnvironments
```

Normalize returned environments into the common schema below.

### Public dashboard endpoints

The backend should try a configurable list, because endpoint shapes may change:

```text
https://api.oncompute.ai/envs
https://api.oncompute.ai/nodes
https://api.oncompute.ai/summary
https://api.oncompute.ai/all-summary
https://analytics.oncompute.ai/global-stats
https://analytics.oncompute.ai/gpu-popularity
```

Raw responses must be stored before normalization.

## Common public normalized resource schema

Public resource API responses omit private node endpoint URLs. Operator-configured endpoints remain server-side only; direct-node rows should use a non-secret provider identifier/label.


```json
{
  "snapshotId": "2026-05-31T00:00:00Z:source:node",
  "timestamp": "2026-05-31T00:00:00Z",
  "source": "dashboard-api | analytics-api | direct-node | sample",
  "providerId": "string",
  "providerLabel": "string",
  "environmentId": "string",
  "region": "string",
  "resourceType": "gpu | cpu | ram | disk | unknown",
  "resourceName": "H200 SXM5",
  "total": 4,
  "inUse": 1,
  "available": 3,
  "feeToken": "USDC",
  "pricePerMinute": 0.036,
  "pricePerHour": 2.16,
  "minJobDuration": 60,
  "maxJobDuration": 3600,
  "runningJobs": 1,
  "status": "available | busy | unknown",
  "raw": "internal only; redacted from public API responses"
}
```

## Aggregated dashboard metrics

### Supply metrics

- Total advertised GPUs.
- Available GPUs.
- GPU types.
- Providers with GPU supply.
- Average price per GPU-hour.
- Minimum H200 price.
- Regions represented.

### Reliability metrics

V0 can show placeholders. V1 should collect:

- 24h uptime.
- 7d uptime.
- benchmark pass rate;
- job success rate;
- average queue time;
- average job duration;
- failure/refund rate.

### Usage metrics

V0 placeholder / sample until Fish API exists:

- AI requests served.
- Ocean-native jobs completed.
- external fallback requests.
- provider payouts.
- credits spent.
- gross margin estimate.

### OCEAN utility metrics

V0 placeholder until contracts exist:

- OCEAN staked.
- OCEAN provider-bonded.
- Fish Credits issued.
- Fish Credits spent.
- OCEAN bought / locked / burned.

## Dashboard UI sections

### 1. Status header

Show:

- last updated time;
- data state badge;
- refresh button;
- source count;
- fallback warning if sample data is active.

### 2. KPI cards

Cards:

- `GPU supply`
- `Available now`
- `Providers`
- `H200 from`
- `Jobs completed`
- `Provider payouts`

### 3. GPU supply table

Columns:

- GPU type;
- total;
- available;
- providers;
- lowest $/hr;
- median $/hr;
- regions.

### 4. Provider scorecard

Columns:

- provider;
- node;
- region;
- GPU;
- available;
- price/hr;
- uptime;
- benchmark status;
- pilot eligible.

### 5. Usage proof

V0: disabled state or sample.

V1+: show:

- requests;
- jobs;
- receipts;
- payouts;
- refunds;
- Ocean-native share vs fallback share.

### 6. OCEAN utility proof

V0: explain future metrics.

V3+: show real staking and bonding numbers.

## Phase 2/3 proof-dashboard extension

The V0 dashboard proves live or recent Ocean Network supply. The Phase 2/3 dashboard must add Fish-native proof without mixing it into network-wide Oncompute analytics.

Implementation plans:

- `docs/provider-pilot-plan.md`
- `docs/proof-dashboard-plan.md`

Additional Phase 2/3 sections:

- selected provider registry and allowlist;
- provider scorecard;
- batch inference job ledger;
- signed usage receipt ledger;
- payout accounting summary;
- benchmark matrix;
- public-safe proof page.

Rules:

- Keep Fish-native jobs separate from network-wide Oncompute jobs.
- Keep benchmark jobs separate from paid user jobs.
- Keep sample proof fixtures separate from live or snapshot proof data.
- Show receipt signature status wherever a receipt count is shown.
- Hide prompts, outputs, contact details, private payout details, full node IPs, and operator notes from public views.

## Backend API contract

See `api/openapi.yaml`.

Required endpoints:

```text
GET /api/health
GET /api/ocean/summary
GET /api/ocean/resources
GET /api/ocean/providers
POST /api/ocean/refresh
GET /api/usage/summary
POST /api/waitlist
POST /api/providers/apply
```

## Scheduled ingestion

Production should run every 15 minutes:

```text
collect raw data
normalize resources
write snapshot
update aggregate summary
emit dashboard cache
```

Keep raw payloads for debugging.

## Acceptance criteria for V0

- Landing page shows dashboard preview.
- Backend returns valid JSON at `/api/ocean/summary`.
- Backend labels data as live/sample/unavailable.
- Frontend never silently shows sample data as live.
- Provider and user forms work locally or write to file/log in prototype.
- Agentic coders can replace storage with Postgres without changing frontend contracts.
