# Fish Deployment

This document is the server handoff for the Fish V0 website.

## Runtime

- Node.js 22 in production Docker image.
- Next.js standalone server.
- Port `3000` by default.
- Local JSON persistence for pilot submissions and prototype Fish API ledger files.

## Build

```bash
npm ci
npm run verify
docker build -t opfish-web:latest .
```

## Fresh VM Preview Deployment

This is the quickest safe launch path for a new server: Docker Compose runs the Fish app and nginx protects the whole site with a username and password.

Server assumptions:

- Ubuntu 22.04/24.04 or another Docker-friendly Linux image.
- Ports `22` and `80` open.
- Docker Engine with the Compose plugin installed.
- Repository checked out from the deploy branch at `https://github.com/Ocean-Navy/Fish.git`.

On the VM:

```bash
git clone --branch codex/finish-fish-v0-website https://github.com/Ocean-Navy/Fish.git Fish
cd Fish
cp .env.production.example .env.production
```

Edit `.env.production` and set at least:

```text
FISH_ADMIN_TOKEN=<long random secret>
FISH_CHAT_BACKEND=mock
```

Create the nginx Basic Auth user:

```bash
make nginx-password BASIC_USER=fish BASIC_PASSWORD='<long preview password>'
```

Start the protected preview:

```bash
make preview-up
docker compose -f deploy/docker-compose.preview.yml --env-file .env.production ps
curl -fsS http://127.0.0.1/api/health
```

The site is then available at:

```text
http://<server-ip>/
```

The browser will ask for the nginx username and password. For a public launch, remove the preview auth proxy or replace it with a TLS/public nginx configuration while keeping `FISH_ADMIN_TOKEN` enabled for admin API exports.

## Run With Docker

```bash
docker run -d \
  --name opfish-web \
  --restart unless-stopped \
  -p 3000:3000 \
  -e FISH_ADMIN_TOKEN="$FISH_ADMIN_TOKEN" \
  -v opfish-submissions:/app/data/submissions \
  -v opfish-ledger:/app/data/fish \
  -v opfish-proof:/app/data/proof \
  -v opfish-staking:/app/data/staking \
  opfish-web:latest
```

Health check:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

## Run With Docker Compose

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f fish-web
```

Stop:

```bash
docker compose down
```

## Reverse Proxy

For the protected preview, use:

```bash
docker compose -f deploy/docker-compose.preview.yml --env-file .env.production up --build -d
```

The included nginx config forwards traffic to:

```text
http://fish-web:3000
```

Required proxy headers:

```text
Host
X-Forwarded-Proto
X-Forwarded-For
```

## Persistent Data

The V0 form sink, prototype API ledger, provider proof receipts, payout accounting files, benchmark runs, offchain staking credits, and the prototype proof signing key write JSON to:

```text
/app/data/submissions
/app/data/fish
/app/data/proof
/app/data/staking
```

Back up these volumes or replace the sinks with a database/email/CRM integration and secret-managed signing key before running a public campaign.

## Signup Exports

Public forms write one JSON file per submission in `/app/data/submissions` inside the `fish-submissions` Docker volume.

Admin export endpoint:

```bash
curl -u fish:'<nginx password>' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  "http://<server-ip>/api/submissions/export?format=csv" \
  -o fish-submissions.csv
```

Filters:

```text
kind=all       default
kind=waitlist  user, builder, and holder signups
kind=provider  GPU provider applications
format=json    JSON response instead of CSV
```

Direct volume fallback:

```bash
docker compose -f deploy/docker-compose.preview.yml --env-file .env.production exec fish-web \
  sh -lc 'ls -lah /app/data/submissions'
```

## Environment

All variables are optional.

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

Set `FISH_ADMIN_TOKEN` in production-like environments before issuing prototype API keys.
Set `FISH_PROVIDER_ALLOWLIST` or mount `data/provider_allowlist.json` when the first selected providers are approved.
Keep `FISH_CHAT_BACKEND=mock` for a no-secret local deployment. Set `FISH_CHAT_BACKEND=external`, `FISH_EXTERNAL_CHAT_BASE_URL`, `FISH_EXTERNAL_CHAT_API_KEY`, and `FISH_EXTERNAL_CHAT_MODEL` only when you want `/v1/chat/completions` to call a real OpenAI-compatible backend.

## Verification

Before publishing:

```bash
npm run verify
docker build -t opfish-web:latest .
docker compose up --build -d
curl -fsS http://127.0.0.1:3000/api/health
```

Then browser-check:

- `/`
- `/#market`
- `/#pilot`
- `/proof`
- `/routing`
- `/account`
- `/dashboard`
- `/api`
- `/docs`
- `/providers`
- `/chat`
- `/api/proof/summary`
- `/api/proof/receipts`
- `/api/proof/providers`
- `/api/proof/benchmarks`
- `/api/proof/market-making`
- `/api/proof/payouts`
- `/api/proof/payouts?state=accrued&limit=10`
- `/api/billing/plans`
- `/api/billing/usage-analytics`
- `/api/routing/policy`
- `/api/staking/summary`
- `/api/submissions/export?format=csv` with `x-fish-admin-token`
