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

This is the quickest preview path for a new server: Docker Compose runs the Fish app and nginx protects the whole site with a username and password.

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

## Small VM No-Docker Deployment

Use this path on very small servers where Docker builds are too memory-heavy. Build locally, copy the Next.js standalone output, and run it with systemd behind host nginx.

Local build:

```bash
npm run verify
```

Copy runtime files:

```bash
ssh root@<server-ip> 'mkdir -p /opt/fish-web /opt/fish-web/.next/static /opt/fish-web/public'
rsync -az --delete .next/standalone/ root@<server-ip>:/opt/fish-web/
rsync -az --delete .next/static/ root@<server-ip>:/opt/fish-web/.next/static/
rsync -az --delete public/ root@<server-ip>:/opt/fish-web/public/
```

Server setup:

```bash
apt-get update
apt-get install -y nginx curl xz-utils
```

Install Node.js 22, create `/opt/fish-web/.env.production`, then install the service and nginx templates:

```bash
cp deploy/systemd/fish-web.service /etc/systemd/system/fish-web.service
cp deploy/nginx/host-fish.conf /etc/nginx/sites-available/fish
ln -sf /etc/nginx/sites-available/fish /etc/nginx/sites-enabled/fish
rm -f /etc/nginx/sites-enabled/default
systemctl daemon-reload
systemctl enable --now fish-web nginx
nginx -t
systemctl reload nginx
```

The host nginx template is public by default. Keep `FISH_ADMIN_TOKEN` enabled for export and admin-only endpoints.

For HTTPS, issue the certificate after DNS points at the VM:

```bash
apt-get install -y certbot
mkdir -p /var/www/letsencrypt /etc/letsencrypt/renewal-hooks/deploy
certbot certonly --webroot \
  -w /var/www/letsencrypt \
  -d op.fish \
  --non-interactive \
  --agree-tos \
  --email robin@dataunion.app
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
certbot renew --dry-run
```

Keep generated admin tokens in a root-only file such as `/root/fish-deploy-secrets.txt`.

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
curl -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
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
FISH_PROVIDER_JOB_ENDPOINTS=
FISH_PROVIDER_JOB_API_KEY=
FISH_OCEAN_BATCH_ENDPOINT=
FISH_OCEAN_BATCH_API_KEY=
FISH_OCEAN_BATCH_PROVIDER_ID=ocean-batch-provider
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=30
FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS=600
FISH_DOCS_BATCH_MAX_COST_USD=1
FISH_CHAT_ROUTE=mock
FISH_CHAT_BACKEND=mock
FISH_MAX_INPUT_TOKENS=1000
FISH_MAX_OUTPUT_TOKENS=512
FISH_DAILY_KEYED_QUOTA=20
FISH_DAILY_ANONYMOUS_QUOTA=5
FISH_MAX_CONCURRENT_REQUESTS=8
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
FISH_OCEAN_PROVIDER_BASE_URL=
FISH_OCEAN_PROVIDER_API_KEY=
FISH_OCEAN_PROVIDER_MODEL=
FISH_OCEAN_PROVIDER_ID=selected-ocean-provider
FISH_OCEAN_PROVIDER_COST_USD_PER_1K_TOKENS=0
FISH_OCEAN_PROVIDER_DAILY_BUDGET_USD=25
FISH_RUNNER_PUBLIC_KEY_ID=
FISH_RUNNER_PUBLIC_KEY_PEM=
FISH_RUNNER_PUBLIC_KEYS_JSON=
FISH_RUNNER_PUBLIC_KEYS_PATH=
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

Set `FISH_ADMIN_TOKEN` in production-like environments before issuing prototype API keys.
Set `FISH_PROVIDER_ALLOWLIST` or mount `data/provider_allowlist.json` when the first selected providers are approved.
Set `FISH_PROVIDER_JOB_ENDPOINTS=prov_abc=https://provider.example.com/fish/jobs` and optionally `FISH_PROVIDER_JOB_API_KEY` only when a selected provider has a private HTTP job adapter ready. Until then, keep provider proof on mock/sample data.
Set `FISH_OCEAN_BATCH_ENDPOINT` and optionally `FISH_OCEAN_BATCH_API_KEY` only when a private Oncompute/Ocean batch adapter is ready. Until then, `/api/ocean/batch/jobs` should stay in sample mode.
Set `FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS` and `FISH_DOCS_BATCH_MAX_COST_USD` to cap Docs dish batch requests generated through `/v1/chat/completions`.
Plan-based per-minute limits are enforced in-process from the Fish plan table, while daily quotas use local JSON and concurrent request caps use in-memory counters.
Keep `FISH_CHAT_BACKEND=mock` for a no-secret local deployment. Set `FISH_CHAT_ROUTE=ocean-provider`, `FISH_OCEAN_PROVIDER_BASE_URL`, `FISH_OCEAN_PROVIDER_API_KEY`, and `FISH_OCEAN_PROVIDER_MODEL` only when a selected Ocean provider or Fish Runner `/v1` endpoint is ready. Set `FISH_CHAT_BACKEND=external`, `FISH_EXTERNAL_CHAT_BASE_URL`, `FISH_EXTERNAL_CHAT_API_KEY`, and `FISH_EXTERNAL_CHAT_MODEL` only when you want `/v1/chat/completions` to call an outside OpenAI-compatible backend.

Warm inference operations are covered in `docs/warm-inference-runbook.md`. The MVP path is a private vLLM endpoint, ideally behind Fish Runner, on a GPU host that may also run Ocean Node for provider identity and anchoring. Keep the warm route on mock until the private endpoint is ready, then switch `FISH_CHAT_ROUTE=ocean-demo-vllm` for the demo lane or `FISH_CHAT_ROUTE=ocean-provider` for selected provider testing. Check `/routing`, `/api/routing/policy`, and `/api/warm/status` after changing routes.

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
- `/ask`
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
- `/api/warm/status`
- `/api/staking/summary`
- `/api/submissions/export?format=csv` with `x-fish-admin-token`
