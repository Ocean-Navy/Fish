# Fish

Fish is an Ocean Navy-built product layer for turning Ocean Network / Oncompute supply into simple AI access.

The public V0 is intentionally simple: a visual Venice fish-market homepage, role-based entrances, a pilot interest form, and a separate live supply dashboard for builders.

> Built by Ocean Navy. Built on Ocean Protocol. Not official unless approved.

## What Ships In V0

- Visual landing page with a Venice fork / Ocean Navy identity.
- Role entrances for users, builders, providers, and OCEAN holders.
- Simple Fish loop: stake OCEAN, catch FISH, use AI, providers get paid, Ocean grows.
- `/dashboard` with live Oncompute/Ocean supply signals and sample-data fallback.
- `/proof` with a simple public proof harbor for receipts, provider boats, payouts, and benchmarks.
- Waitlist/provider intake APIs that persist JSON submissions locally.
- Admin-only signup export for launch lead follow-up.
- Prototype `/v1` AI API with local API keys, Fish Credits debits, and usage receipts.
- `/ask` with a Fish meal counter: Quick Catch, Code Roll, Clear Broth, Docs Bento, Image Catch, Proposal Platter, and Ocean Special.
- `/api/meal/order` for a capped guest meal-counter demo without exposing a Fish API key.
- `/api/warm/status` for public-safe warm Ocean demo readiness without endpoint URLs or secrets.
- `/api/ocean/batch/jobs` for hash-only Docs/Ocean batch receipts, sample by default until a private batch adapter is configured.
- `/chat` remains available as the same pilot AI meal counter for chat-oriented links.
- Production Docker image, Docker Compose service, and public nginx/systemd deployment.
- Warm inference operator runbook and minimal Fish Runner sidecar for a private vLLM MVP path.

## Quick Start

Use Node 22 for local development. The Docker image also runs Node 22.

```bash
nvm use
npm ci
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Useful local routes:

```text
/
/dashboard
/proof
/routing
/account
/ask
/api/health
/api/ocean/summary
/api/ocean/resources
/api/ocean/batch/jobs
/api/billing/plans
/api/billing/usage-analytics
/api/routing/policy
/api/warm/status
/api/meal/order
/api/providers/pilot
/api/submissions/export
/api/proof/summary
/api/proof/receipts
/api/proof/providers
/api/proof/benchmarks
/api/proof/market-making
/api/proof/payouts
/api/staking/summary
/api
/docs
/chat
/v1/models
```

## Development Commands

```bash
npm run lint       # ESLint for app and src
npm run typecheck  # TypeScript check
npm run build      # Production Next.js build
npm run smoke      # Typecheck + build
npm run verify     # Lint + typecheck + build
```

The same commands are exposed through `make`:

```bash
make install
make dev
make verify
```

## Docker Deployment

Build and run locally:

```bash
docker build -t opfish-web:latest .
docker run --rm -p 3000:3000 \
  -e FISH_ADMIN_TOKEN="$FISH_ADMIN_TOKEN" \
  -v opfish-submissions:/app/data/submissions \
  -v opfish-ledger:/app/data/fish \
  -v opfish-proof:/app/data/proof \
  -v opfish-staking:/app/data/staking \
  opfish-web:latest
```

Or use Compose:

```bash
docker compose up --build
```

Check health:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

The container runs the Next.js standalone server as a non-root user. Form submissions, prototype API ledger files, provider proof files, and offchain staking credit records are written to:

```text
/app/data/submissions
/app/data/fish
/app/data/proof
/app/data/staking
```

Compose mounts those paths as named volumes named `fish-submissions`, `fish-ledger`, `fish-proof`, and `fish-staking`.

### Protected VM Preview

For a fresh VM or password-protected preview, copy the production example, set a real admin token, and create an nginx password file:

```bash
cp .env.production.example .env.production
make nginx-password BASIC_USER=fish BASIC_PASSWORD='replace-with-a-long-password'
make preview-up
```

This runs the Next.js app behind nginx on port `80` with HTTP Basic Auth enabled for the whole site. The health route stays open for container checks:

```bash
curl -fsS http://127.0.0.1/api/health
```

Use `make preview-down` to stop it.

For tiny VMs, use the no-Docker systemd/nginx path in `docs/deployment.md`.

### Signup Access

The homepage form writes one JSON file per signup to the persistent Docker volume mounted at:

```text
/app/data/submissions
```

Export leads through the admin-only endpoint:

```bash
curl -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  "http://your-server/api/submissions/export?format=csv" \
  -o fish-submissions.csv
```

Use `kind=waitlist` or `kind=provider` to filter the export.

## Configuration

All configuration is optional for V0. Defaults point at current public Oncompute endpoints and fall back to sample data when live sources are unavailable.

```text
ONCOMPUTE_NODES_URL=https://api.oncompute.ai/nodes
ONCOMPUTE_ENVS_URL=https://api.oncompute.ai/envs
ONCOMPUTE_STATS_URL=https://analytics.oncompute.ai/global-stats
ONCOMPUTE_MAX_PAGES=3
PORT=3000
HOSTNAME=0.0.0.0
FISH_ADMIN_TOKEN=
FISH_PROVIDER_ALLOWLIST=
FISH_PROVIDER_JOB_ENDPOINTS=
FISH_PROVIDER_JOB_API_KEY=
FISH_OCEAN_BATCH_ENDPOINT=
FISH_OCEAN_BATCH_API_KEY=
FISH_OCEAN_BATCH_PROVIDER_ID=ocean-batch-provider
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=30
FISH_CHAT_ROUTE=mock
FISH_CHAT_BACKEND=mock
FISH_MAX_INPUT_TOKENS=1000
FISH_MAX_OUTPUT_TOKENS=512
FISH_DAILY_KEYED_QUOTA=20
FISH_DAILY_ANONYMOUS_QUOTA=5
FISH_GUEST_CREDIT_GRANT=25
FISH_CHAT_PAUSED=false
FISH_ROUTER_KILL_SWITCH=false
FISH_MOCK_DAILY_BUDGET_USD=0
FISH_OCEAN_DEMO_VLLM_BASE_URL=
FISH_OCEAN_DEMO_VLLM_API_KEY=
FISH_OCEAN_DEMO_VLLM_MODEL=
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS=0
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=50
FISH_EXTERNAL_CHAT_BASE_URL=
FISH_EXTERNAL_CHAT_API_KEY=
FISH_EXTERNAL_CHAT_MODEL=
FISH_EXTERNAL_PROVIDER_ID=external-compatible
FISH_EXTERNAL_COST_USD_PER_1K_TOKENS=0
FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD=10
FISH_EXTERNAL_FALLBACK_FREE_ALLOWED=false
FISH_STAKING_CREDIT_BUDGET=10000
FISH_STAKING_CREDITS_PER_OCEAN_MONTH=0.1
```

Direct provider endpoints can be listed in:

```text
data/node_endpoints.txt
```

## Prototype Fish API

The Phase 1 API prototype is local-first. It proves API keys, credit debits, and usage receipts before selected Ocean provider routing is live.

Default chat is a deterministic mock. For a real demo deployment, use the Ocean-first route alias and point Fish Gateway at a private Fish Runner or OpenAI-compatible vLLM endpoint:

```text
FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=https://your-private-runner.example/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=...
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS=0
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=50
```

`FISH_CHAT_ROUTE=ocean-first`, `hybrid`, and `ocean-demo-vllm` all select the same warm demo route. If the warm route is selected but cannot serve a request, Fish may use the external fallback only when the account plan and fallback budget allow it. The response and receipt keep the final route plus `requestedRoute`, `fallbackFrom`, and `fallbackReason` so external use is visible.

External fallback is separate and should stay capped:

```text
FISH_CHAT_ROUTE=external-fallback
FISH_CHAT_BACKEND=external
FISH_EXTERNAL_CHAT_BASE_URL=https://api.openai.com/v1
FISH_EXTERNAL_CHAT_API_KEY=...
FISH_EXTERNAL_CHAT_MODEL=...
FISH_EXTERNAL_PROVIDER_ID=openai-compatible
FISH_EXTERNAL_COST_USD_PER_1K_TOKENS=0
FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD=10
FISH_EXTERNAL_FALLBACK_FREE_ALLOWED=false
```

Fish stores usage numbers, route metadata, latency, cost estimates, and request hashes in local receipts. The raw prompt is sent to the configured backend, so that backend's privacy policy applies.

Feature caps are layered under the global token limits. For example, Code can have a larger cap than Ask when `FISH_MAX_OUTPUT_TOKENS` is raised, while Images remain disabled until a paid image route exists.

The public route compass shows what is active without exposing secrets:

```bash
curl -sS http://127.0.0.1:3000/api/routing/policy
curl -sS http://127.0.0.1:3000/api/warm/status
```

Use `/routing` for the human-friendly route view and `/dashboard` for warm demo readiness. Both must label mock, external fallback, selected warm demo work, and later selected Ocean provider work differently.

For the warm inference MVP, see `docs/warm-inference-runbook.md`. The practical first deployment is a GPU host with vLLM kept warm behind Fish Gateway or Fish Runner, optionally next to Ocean Node for provider identity and anchoring. Keep the vLLM endpoint private, cap usage, and do not claim Ocean-native live chat until selected-provider routing and proof labels support that claim.

Create a pilot key:

```bash
curl -sS http://127.0.0.1:3000/v1/api_keys \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{"label":"Local pilot","creditGrant":1000,"planId":"free"}'
```

In local development, `FISH_ADMIN_TOKEN` may be empty. Set it in production before issuing keys.

List models:

```bash
curl -sS http://127.0.0.1:3000/v1/models
```

Core dish aliases are listed as models too: `fish-ask`, `fish-code`, `fish-docs`, `fish-ocean-helper`, `fish-clear-broth`, and `fish-proposal`. Passing one of these as `model` applies that dish's feature limits and receipt label even if you do not send `metadata.fish_feature`.

Send a chat request:

```bash
curl -sS http://127.0.0.1:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"model":"fish-ask","messages":[{"role":"user","content":"Explain Fish in one line"}]}'
```

Set `"stream": true` for OpenAI-style server-sent events. V0 streaming is compatibility streaming after Gateway has settled the request; true first-token streaming from Fish Runner is a later hardening step.

Before Fish calls a configured backend, Gateway reserves the maximum estimated credits for the request. Successful requests release the unused reserve and debit the measured usage. Backend failures release the reserve without recording a usage charge.

Check balance, credit lanes, and receipts:

```bash
curl -sS http://127.0.0.1:3000/v1/balance -H "authorization: Bearer $FISH_API_KEY"
curl -sS http://127.0.0.1:3000/v1/usage -H "authorization: Bearer $FISH_API_KEY"
```

Plan metadata is visible in balances and in the public catalog:

```bash
curl -sS http://127.0.0.1:3000/api/billing/plans
```

Aggregate billing analytics are available without API keys or prompt/output text:

```bash
curl -sS http://127.0.0.1:3000/api/billing/usage-analytics
```

Runtime API keys, lane-based credit entries, and receipts are written under `data/fish/`, which is ignored by git. The prototype stores hashed API keys and receipt hashes, but it is not a production ledger yet.

## Provider Pilot Registry

Phase 2 starts with a selected provider registry. Provider applications are read from local form submissions, while selected providers can be marked with either an env var or a local allowlist file.

```bash
cp data/provider_allowlist.example.json data/provider_allowlist.json
```

`data/provider_allowlist.json` is ignored by git because it can contain operator decisions. In production you can also set:

```text
FISH_PROVIDER_ALLOWLIST=prov_abc123,prov_def456
FISH_PROVIDER_JOB_ENDPOINTS=prov_abc123=https://provider.example.com/fish/jobs
FISH_PROVIDER_JOB_API_KEY=shared-provider-adapter-secret
FISH_OCEAN_BATCH_ENDPOINT=https://batch-provider.example.com/fish/ocean-batch
FISH_OCEAN_BATCH_API_KEY=shared-batch-adapter-secret
```

Public-safe registry data is available at:

```text
/api/providers/pilot
```

The endpoint hides contacts, exact endpoints, private payout preferences, and operator notes. It exposes only public labels, status, capacity summary, allowlist constraints, and a Fish-ready checklist. Provider applications can include optional health endpoint, price hint, payout readiness, ops contact, approved runner/container, and no prompt/output logging policy fields. Public responses keep exact values private and use hashes, booleans, or counts instead.

Admin-only operator export is available at:

```text
/api/providers/pilot/export
```

## Provider Job Proof

Selected provider smoke jobs can be recorded through the admin-only prototype adapter:

```bash
curl -sS http://127.0.0.1:3000/api/providers/jobs \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{
    "providerId":"prov_...",
    "workloadType":"chat_batch",
    "model":"fish-demo-chat",
    "inputRef":"sha256:example-input-hash",
    "maxRuntimeSeconds":60,
    "maxCostUsd":1
  }'
```

The adapter checks the selected-provider allowlist before writing a receipt. `adapterMode` defaults to `mock_success`, which is marked `sample` and is useful for testing the proof UI only. Set `adapterMode: "provider_http"` after a selected provider has a private job endpoint in `FISH_PROVIDER_JOB_ENDPOINTS` or `data/provider_allowlist.json`.

The HTTP adapter posts only `jobId`, `providerId`, `workloadType`, `model`, `inputRef`, `parameters`, `maxRuntimeSeconds`, and `maxCostUsd`; it does not send raw prompt or output text. Provider HTTP receipts are marked `snapshot` until a stronger Ocean-native job proof path exists. Successful non-sample selected-provider receipts get a canonical hash and an Ed25519 signature. The first run creates a local prototype signing key at `data/proof/signing-key.json`; keep that proof volume backed up if you want stable signing identity across deploys.

Public proof endpoints are:

```text
/api/proof/summary
/api/proof/receipts
/api/proof/providers
/api/proof/benchmarks
/api/proof/market-making
/api/proof/payouts
```

The receipt ledger supports `provider`, `providerId`, `status`, `backend`, `receiptType`, `signatureStatus`, `from`, `to`, and `limit` filters. Public receipt detail is available through each row's `detailUrl` and shows hashes, signature state, usage, cost, and timestamps without prompt or output text.

The payout summary supports `provider`, `providerId`, `state`, `eventType`, `sourceReceiptId`, `from`, `to`, and `limit` filters. It includes provider-level rollups, payable totals, excluded disputed/voided totals, and public-safe event rows that identify receipt-linked versus manual-adjustment sources.

Successful non-sample provider job receipts automatically create `job_accrued` payout events. Public payout summaries omit operator owners, operator reasons, and transaction references; the admin CSV exports keep those details for settlement review.

Operators can add manual payout events, create review batches, and export CSVs:

```bash
curl -sS http://127.0.0.1:3000/api/proof/payouts \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{
    "providerId":"prov_...",
    "eventType":"manual_adjustment",
    "amountUsd":5,
    "reason":"Manual pilot stipend"
  }'

curl -sS http://127.0.0.1:3000/api/proof/payouts/batches \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{"states":["accrued","approved"],"reason":"First provider review batch"}'

curl -sS http://127.0.0.1:3000/api/proof/payouts/export \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN"

curl -sS http://127.0.0.1:3000/api/proof/payouts/batches/batch_.../export \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN"

curl -sS 'http://127.0.0.1:3000/api/proof/receipts/export?format=json&limit=50' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN"
```

Provider job receipts, payout events, payout batches, and the local prototype signing key are written under `data/proof/`, which is ignored by git and should be backed up or moved to a database/secret manager before public scale-up.

## OCEAN Staking Credits

Phase 4 starts as an offchain prototype. Operators can record an OCEAN lock, issue spendable Fish Credits into the existing API ledger, and track whether those credits are actually used.

```bash
curl -sS http://127.0.0.1:3000/api/staking/positions \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{
    "holderLabel":"Pilot holder",
    "walletRef":"0x...",
    "oceanAmount":1000,
    "lockDays":30
  }'
```

The response returns a one-time Fish API key when credits are issued. Public staking credit summary is available at:

```text
/api/staking/summary
```

Staking positions are written under `data/staking/`, which is ignored by git. This is not an onchain staking contract; it is a funded-budget prototype for proving OCEAN lock intent, credit issuance, and credit spend.

## Provider Benchmarks

Selected providers can run small repeatable route tests. Benchmark definitions use hash references only, not prompt text, and public summaries do not include prompt or output text.

```bash
curl -sS http://127.0.0.1:3000/api/proof/benchmarks \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{"providerId":"prov_...","benchmarkId":"tiny_smoke"}'
```

The public benchmark board returns definitions, recent runs, matrix rows, public report rows, totals, and warnings:

```text
/api/proof/benchmarks
```

Benchmark run files are written to `data/proof/benchmark-runs/` and validate before they are included in public summaries. See `docs/benchmark-matrix-plan.md` for the Phase 3 benchmark matrix contract.

## Provider Scorecards

The public provider scorecard is available at:

```text
/api/proof/providers
```

It uses public labels and derives score inputs from reliability, benchmark performance, cost confidence, and operator readiness. It does not expose provider contacts, endpoint URLs, private payout details, operator owners, or operator notes.

## Market-Making Report

The Phase 3 market-making report combines supply, Fish demand, scorecards, and benchmark cost rows into public routing lanes:

```text
/api/proof/market-making
```

The report returns route rules, route candidates, conservative price bands, margin estimates, and warnings. It is public-safe and does not store or expose prompt text, output text, provider contacts, endpoint URLs, or private payout settlement data. See `docs/market-making-report.md` for the report contract.

## Ocean Batch Jobs

The first Docs/Ocean batch contract is available at:

```text
GET /api/ocean/batch/jobs
POST /api/ocean/batch/jobs
```

`POST` requires a Fish API key and accepts only hash/reference input through `inputRef`; it does not accept or store raw document text. `adapterMode: "sample_success"` is the default local proof mode. Set `adapterMode: "ocean_http"` only when `FISH_OCEAN_BATCH_ENDPOINT` points to a private Oncompute/Ocean batch adapter. Fish checks `maxCostUsd` against `FISH_OCEAN_BATCH_DAILY_BUDGET_USD` before calling the batch adapter.

Batch receipts are written under `data/ocean-batch/`, and successful jobs also write Fish usage receipts so the public dashboard can count them as Ocean-native usage. See `docs/ocean-batch-jobs-plan.md` for the adapter contract.

## Repository Structure

```text
app/                         Next.js pages and API routes
src/components/              Market UX, forms, dashboard UI
src/lib/                     Oncompute ingestion, formatting, submissions, ledgers
app/v1/                      Prototype Fish API routes
public/assets/generated/     Text-free generated website illustrations
public/assets/visual-identity/ Reference-only visual direction assets
data/sample_supply.json      Offline dashboard fallback
data/node_endpoints.txt      Optional direct provider endpoints
data/provider_allowlist.example.json Provider allowlist template
docs/                        Implementation and visual identity notes
deploy/warm-inference/       Private vLLM and Fish Runner deployment examples
legacy/static-prototype/     Original static prototype
Dockerfile                   Production standalone Next.js image
docker-compose.yml           Production-like local service
```

## Data And Privacy

The pilot form stores submissions as local JSON files. Do not collect secrets in the form. For production, either mount persistent storage or replace `src/lib/submissions.ts` with a database/email/CRM integration.

Ignored local runtime paths:

```text
data/submissions/
data/forms/
data/fish/
data/proof/
data/ocean-batch/
data/staking/
.env*
.next/
node_modules/
```

## Visual Direction

Fish should feel like entering a Venice fish market with Ocean Navy energy:

- users enter the meal counter;
- builders enter the API hatch;
- providers bring fishing boats and GPU crews;
- OCEAN holders enter the vault door.

Keep the first product surface simple: Ask, Code, Docs, Images, API, Dashboard. Fish can handle routing, cost caps, receipts, and Ocean proof behind the counter.

Generated images should be text-free and used as scene assets. Render copy, buttons, forms, and metrics in accessible HTML.

## Pre-Launch Checklist

- `npm run verify` passes.
- `docker build -t opfish-web:latest .` passes.
- `/api/health` returns `ok: true`.
- `/` is visually clear on mobile and desktop.
- `/dashboard` loads with live data or sample fallback.
- `data/submissions` is persisted or integrated with a real intake system.
- Public copy keeps the status clear: Ocean Navy-built, on Ocean Protocol, not official unless approved.
