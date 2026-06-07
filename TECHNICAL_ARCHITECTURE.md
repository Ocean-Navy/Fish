# Technical Architecture

## Current main branch architecture

The current production path is a Next.js App Router application with local-first runtime ledgers and private adapter sidecars:

```text
Browser / API client
  -> Fish Web App
      -> public pages and public-safe APIs
      -> Fish API Gateway
      -> credit, payment, proof, faucet, support, and staking ledgers
      -> route policy and budget guards
      -> private Fish Runner or OpenAI-compatible backend
      -> private Ocean workload adapter
          -> local Ocean Node free compute, or
          -> external Ocean CLI / Oncompute proof path
```

The public web process must not hold raw public claims beyond what proof labels can support. It stores hashes, source labels, route metadata, usage, cost, support tickets, and public-safe proof rows. It does not store raw prompts or outputs in public proof, dashboards, billing rows, receipts, or exports.

Runtime data is still local JSON under ignored `data/*` paths. This is acceptable for private and early public-testnet operation with backups, but public scale should move ledgers to a managed database and proof signing keys to secret management.

Current source-state labels:

```text
sample       local fake/sample path
snapshot     private adapter, selected provider, or local Ocean Node proof
live         confirmed live/onchain or stronger externally verifiable data
unavailable  route/config/source is not available
```

Current hard gates:

- paid checkout stays blocked until Stripe or Base mainnet USDC readiness passes and paid top-ups are deliberately unpaused;
- Base mainnet contract writes stay blocked unless explicitly enabled after audit/legal/multisig review;
- production guest demo routes fail closed until `FISH_GUEST_ID_SALT` is set;
- external Ocean/Oncompute proof stays manual until a live adapter env produces a non-sample receipt from a non-local Ocean/Oncompute node.

## V0 architecture

```text
Browser
  → Next.js App Router landing page
  → Next.js API routes
  → Ocean Network / Oncompute public APIs and direct Ocean Node APIs
  → sample fallback if live data unavailable
```

## V1 architecture

```text
Browser / API client
  → Fish Web App
  → Fish API Gateway
      → AI route adapter
      → usage ledger
      → credit ledger
      → provider router
      → Ocean Network adapter
      → external fallback adapter
  → selected Ocean providers
  → settlement dashboard
```

## V0 components

### App Router landing page

Location:

```text
app/page.tsx
app/globals.css
src/components/*
```

Purpose:

- explain concept;
- show dashboard preview;
- collect pilot interest.

### Dashboard backend

Location:

```text
app/api/ocean/*/route.ts
src/lib/oceanSupply.ts
```

Purpose:

- fetch Ocean Network supply data;
- normalize data;
- label live/sample state;
- serve JSON endpoints.

The original Python prototype remains in `backend/` as reference code. The production V0 path is the TypeScript/Next.js implementation.

### Sample data

Location:

```text
data/sample_supply.json
public/data/sample_supply.json
```

Purpose:

- make the landing page work without backend or live endpoints;
- demonstrate dashboard design.

## Production stack recommendation

### Frontend

- Next.js App Router.
- TypeScript.
- Tailwind CSS generated from `DESIGN.md` tokens.
- Server components for dashboard pages where useful.
- Client components for live refresh and forms.

### Backend

- API routes or standalone service.
- PostgreSQL for snapshots, waitlists, provider applications, usage receipts.
- Redis or queue for scheduled ingestion.
- Cron job every 15 minutes for compute supply snapshots.

### Deployment

- Vercel / Cloudflare Pages / similar for frontend.
- Fly.io / Railway / Docker host / cloud VM for backend if separate.
- Postgres managed database.
- Secrets managed via deployment environment.

## Backend modules

```text
SupplyIngestor
  fetch dashboard sources
  fetch direct nodes
  store raw payloads
  normalize resources

ProviderRegistry
  provider application
  provider metadata
  scorecard
  pilot eligibility

UsageLedger
  AI requests
  model/backend
  cost
  provider payout
  receipt hash

CreditLedger
  user credits
  staking credits later
  spend/refund

SettlementEngine
  provider payable events
  payout batches
  proof dashboard
```

These modules now exist as TypeScript helpers and App Router routes in prototype/local-ledger form. The next architectural upgrade is persistence and operations: replace local JSON ledgers with a database, move proof/payment secrets into managed secret storage, and run the Ocean workload adapter/Fish Runner on private infrastructure.

## Database tables

### `supply_snapshots`

```sql
id uuid primary key
created_at timestamptz not null
source text not null
state text not null
raw jsonb not null
```

### `compute_resources`

```sql
id uuid primary key
snapshot_id uuid references supply_snapshots(id)
provider_id text
node_endpoint text
environment_id text
region text
resource_type text
resource_name text
total numeric
in_use numeric
available numeric
fee_token text
price_per_minute numeric
price_per_hour numeric
status text
raw jsonb
```

### `provider_applications`

```sql
id uuid primary key
created_at timestamptz not null
contact text not null
node_endpoint text
gpu_type text
region text
payout_preference text
notes text
status text default 'new'
```

### `waitlist_entries`

```sql
id uuid primary key
created_at timestamptz not null
contact text not null
role text
use_case text
expected_usage text
ocean_holder boolean
notes text
```

### `usage_receipts` later

```sql
id uuid primary key
created_at timestamptz not null
user_id uuid
api_key_id uuid
model text
backend text
provider_id text
input_tokens integer
output_tokens integer
user_charge numeric
provider_cost numeric
status text
receipt_hash text
```

## Security and privacy

V0:

- do not store raw prompts or outputs in receipts, public proof, dashboards, billing rows, or exports;
- store proof tickets, hashes, source-state labels, route labels, usage, cost, and credit fields instead of raw order data;
- label the active processing route so users can tell whether demo mode, outside AI, Ocean batch, or a selected provider handled the order;
- do not store private wallet information beyond explicit form fields;
- avoid telemetry that leaks sensitive data;
- separate sample data from live data.

V1+:

- API keys hashed at rest;
- prompt logging disabled by default;
- private upload storage with signed job references and short default input retention;
- user-facing deletion for stored outputs and private job data;
- provider receipts exclude prompt text;
- selected providers reviewed for no prompt/output retention before receiving user workloads;
- PII in forms encrypted or protected;
- admin dashboard protected;
- rate limiting.

## API compatibility target later

Fish AI API should aim for OpenAI-compatible endpoints:

```text
GET  /v1/models
POST /v1/chat/completions
POST /v1/embeddings
GET  /v1/usage
GET  /v1/balance
POST /v1/api_keys
```

This is not required for V0 landing page.
