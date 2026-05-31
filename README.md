# Fish

Fish is an Ocean Navy-built product layer for turning Ocean Network / Oncompute supply into simple AI access.

The public V0 is intentionally simple: a visual Venice fish-market homepage, role-based entrances, a pilot interest form, and a separate live supply dashboard for builders.

> Built by Ocean Navy. Built on Ocean Protocol. Not official unless approved.

## What Ships In V0

- Visual landing page with a Venice fork / Ocean Navy identity.
- Role entrances for users, builders, providers, and OCEAN holders.
- Simple Fish loop: stake OCEAN, catch FISH, use AI, providers get paid, Ocean grows.
- `/dashboard` with live Oncompute/Ocean supply signals and sample-data fallback.
- Waitlist/provider intake APIs that persist JSON submissions locally.
- Prototype `/v1` AI API with local API keys, Fish Credits debits, and usage receipts.
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
/api/health
/api/ocean/summary
/api/ocean/resources
/api
/docs
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

The container runs the Next.js standalone server as a non-root user. Form submissions and prototype API ledger files are written to:

```text
/app/data/submissions
/app/data/fish
```

Compose mounts those paths as named volumes named `fish-submissions` and `fish-ledger`.

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
```

Direct provider endpoints can be listed in:

```text
data/node_endpoints.txt
```

## Prototype Fish API

The Phase 1 API prototype is local-first. It proves API keys, credit debits, and usage receipts before selected Ocean provider routing is live.

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

Send a mock chat request:

```bash
curl -sS http://127.0.0.1:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"model":"fish-demo-chat","messages":[{"role":"user","content":"Explain Fish in one line"}]}'
```

Check balance and receipts:

```bash
curl -sS http://127.0.0.1:3000/v1/balance -H "authorization: Bearer $FISH_API_KEY"
curl -sS http://127.0.0.1:3000/v1/usage -H "authorization: Bearer $FISH_API_KEY"
```

Runtime API keys and receipts are written under `data/fish/`, which is ignored by git. The prototype stores hashed API keys and receipt hashes, but it is not a production ledger yet.

## Repository Structure

```text
app/                         Next.js pages and API routes
src/components/              Market UX, forms, dashboard UI
src/lib/                     Oncompute ingestion, formatting, submissions
app/v1/                      Prototype Fish API routes
public/assets/generated/     Text-free generated website illustrations
public/assets/visual-identity/ Reference-only visual direction assets
data/sample_supply.json      Offline dashboard fallback
data/node_endpoints.txt      Optional direct provider endpoints
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
