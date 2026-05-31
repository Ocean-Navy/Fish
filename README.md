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
- Prototype `/v1` AI API with local API keys, Fish Credits debits, and usage receipts.
- `/chat` with a model selector, short local browser thread, credit spend, and receipt display.
- Production Docker image and Docker Compose service.

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
/api/health
/api/ocean/summary
/api/ocean/resources
/api/routing/policy
/api/providers/pilot
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
FISH_CHAT_BACKEND=mock
FISH_EXTERNAL_CHAT_BASE_URL=
FISH_EXTERNAL_CHAT_API_KEY=
FISH_EXTERNAL_CHAT_MODEL=
FISH_EXTERNAL_PROVIDER_ID=external-compatible
FISH_EXTERNAL_COST_USD_PER_1K_TOKENS=0
FISH_STAKING_CREDIT_BUDGET=10000
FISH_STAKING_CREDITS_PER_OCEAN_MONTH=0.1
```

Direct provider endpoints can be listed in:

```text
data/node_endpoints.txt
```

## Prototype Fish API

The Phase 1 API prototype is local-first. It proves API keys, credit debits, and usage receipts before selected Ocean provider routing is live.

Default chat is a deterministic mock. To test real AI calls before Ocean provider routing, point the same Fish API route at an OpenAI-compatible backend:

```text
FISH_CHAT_BACKEND=external
FISH_EXTERNAL_CHAT_BASE_URL=https://api.openai.com/v1
FISH_EXTERNAL_CHAT_API_KEY=...
FISH_EXTERNAL_CHAT_MODEL=...
FISH_EXTERNAL_PROVIDER_ID=openai-compatible
FISH_EXTERNAL_COST_USD_PER_1K_TOKENS=0
```

Fish still stores only usage numbers and a request hash in local receipts. The raw prompt is sent to the configured external backend, so that provider's privacy policy applies.

The public route compass shows what is active without exposing secrets:

```bash
curl -sS http://127.0.0.1:3000/api/routing/policy
```

Use `/routing` for the human-friendly view. It must label mock, external fallback, and selected Ocean provider work differently.

Create a pilot key:

```bash
curl -sS http://127.0.0.1:3000/v1/api_keys \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{"label":"Local pilot","creditGrant":1000}'
```

In local development, `FISH_ADMIN_TOKEN` may be empty. Set it in production before issuing keys.

List models:

```bash
curl -sS http://127.0.0.1:3000/v1/models
```

Send a chat request:

```bash
curl -sS http://127.0.0.1:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"model":"fish-demo-chat","messages":[{"role":"user","content":"Explain Fish in one line"}]}'
```

Check balance, credit lanes, and receipts:

```bash
curl -sS http://127.0.0.1:3000/v1/balance -H "authorization: Bearer $FISH_API_KEY"
curl -sS http://127.0.0.1:3000/v1/usage -H "authorization: Bearer $FISH_API_KEY"
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
```

Public-safe registry data is available at:

```text
/api/providers/pilot
```

The endpoint hides contacts, exact endpoints, private payout preferences, and operator notes. It exposes only public labels, status, capacity summary, and allowlist constraints.

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

The adapter checks the selected-provider allowlist before writing a receipt. Each new provider job receipt gets a canonical hash and an Ed25519 signature. The first run creates a local prototype signing key at `data/proof/signing-key.json`; keep that proof volume backed up if you want stable signing identity across deploys.

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

Successful provider job receipts automatically create `job_accrued` payout events. Public payout summaries omit operator owners, operator reasons, and transaction references; the admin CSV exports keep those details for settlement review.

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
data/staking/
.env*
.next/
node_modules/
```

## Visual Direction

Fish should feel like entering a Venice fish market with Ocean Navy energy:

- users enter the chat counter;
- builders enter the API hatch;
- providers enter the dock master;
- OCEAN holders enter the vault door.

Generated images should be text-free and used as scene assets. Render copy, buttons, forms, and metrics in accessible HTML.

## Pre-Launch Checklist

- `npm run verify` passes.
- `docker build -t opfish-web:latest .` passes.
- `/api/health` returns `ok: true`.
- `/` is visually clear on mobile and desktop.
- `/dashboard` loads with live data or sample fallback.
- `data/submissions` is persisted or integrated with a real intake system.
- Public copy keeps the status clear: Ocean Navy-built, on Ocean Protocol, not official unless approved.
