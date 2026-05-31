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

## Run With Docker

```bash
docker run -d \
  --name opfish-web \
  --restart unless-stopped \
  -p 3000:3000 \
  -e FISH_ADMIN_TOKEN="$FISH_ADMIN_TOKEN" \
  -v opfish-submissions:/app/data/submissions \
  -v opfish-ledger:/app/data/fish \
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

Put a TLS-terminating reverse proxy in front of the app and forward traffic to:

```text
http://127.0.0.1:3000
```

Required proxy headers:

```text
Host
X-Forwarded-Proto
X-Forwarded-For
```

## Persistent Data

The V0 form sink, prototype API ledger, provider proof receipts, and the prototype proof signing key write JSON to:

```text
/app/data/submissions
/app/data/fish
/app/data/proof
```

Back up these volumes or replace the sinks with a database/email/CRM integration and secret-managed signing key before running a public campaign.

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
```

Set `FISH_ADMIN_TOKEN` in production-like environments before issuing prototype API keys.
Set `FISH_PROVIDER_ALLOWLIST` or mount `data/provider_allowlist.json` when the first selected providers are approved.

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
- `/dashboard`
- `/api`
- `/docs`
- `/providers`
- `/api/proof/summary`
