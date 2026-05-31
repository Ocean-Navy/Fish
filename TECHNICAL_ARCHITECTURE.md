# Technical Architecture

## V0 architecture

```text
Browser
  → static landing page
  → dashboard API backend
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

### Static landing page

Location:

```text
app/index.html
app/styles.css
app/app.js
```

Purpose:

- explain concept;
- show dashboard preview;
- collect pilot interest.

### Dashboard backend

Location:

```text
backend/server.py
backend/ocean_supply.py
```

Purpose:

- fetch Ocean Network supply data;
- normalize data;
- label live/sample state;
- serve JSON endpoints.

### Sample data

Location:

```text
data/sample_supply.json
app/data/sample_supply.json
```

Purpose:

- make the landing page work without backend or live endpoints;
- demonstrate dashboard design.

## Production stack recommendation

### Frontend

- Next.js App Router or equivalent modern React framework.
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

## Backend modules to build next

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

- do not store prompts;
- do not store private wallet information beyond explicit form fields;
- avoid telemetry that leaks sensitive data;
- separate sample data from live data.

V1+:

- API keys hashed at rest;
- prompt logging disabled by default;
- provider receipts exclude prompt text;
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

