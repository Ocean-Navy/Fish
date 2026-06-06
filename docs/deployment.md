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
- Repository checked out from `https://github.com/Ocean-Navy/Fish.git` at a reviewed release tag, a protected release branch, or a pinned commit SHA. Do not deploy from mutable feature or Codex branches.

On the VM, set `FISH_RELEASE_REF` to the reviewed release tag or pinned commit SHA that maintainers approved for this deployment:

```bash
FISH_RELEASE_REF=<reviewed-release-tag-or-pinned-commit-sha>
git clone https://github.com/Ocean-Navy/Fish.git Fish
cd Fish
git checkout --detach "$FISH_RELEASE_REF"
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
  -v opfish-forms:/app/data/forms \
  -v opfish-support:/app/data/support \
  -v opfish-ledger:/app/data/fish \
  -v opfish-ocean-batch:/app/data/ocean-batch \
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
cp .env.production.example .env.production
docker compose up --build -d
docker compose ps
docker compose logs -f fish-web
```

The root Compose file reads `${FISH_ENV_FILE:-.env.production}` when present, so payment, contract, faucet, warm-route, and Ocean batch settings can all be configured from the same production env file. Without that file the app uses conservative defaults: mock chat, disabled faucet, disabled contract writes, and disabled paid checkout.

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

The V0 form sink, prototype API ledger, Ocean batch receipts, provider proof receipts, payout accounting files, capacity-pool settlement records, benchmark runs, offchain staking credits, and the prototype proof signing key write JSON to:

```text
/app/data/submissions
/app/data/forms
/app/data/support
/app/data/fish
/app/data/ocean-batch
/app/data/proof
/app/data/staking
```

Back up these volumes or replace the sinks with a database/email/CRM integration and a secret-managed signing key before running a public campaign. Provider proof receipt signing uses `FISH_PROVIDER_PROOF_SIGNING_KEY_ID` and `FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM` when set; otherwise the first run creates `data/proof/signing-key.json`. Receipt verification trusts the configured signing key, the local signing key when present, or pinned provider proof keys configured with `FISH_PROVIDER_PROOF_PUBLIC_KEY_ID`/`FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM`, `FISH_PROVIDER_PROOF_PUBLIC_KEYS_JSON`, or `FISH_PROVIDER_PROOF_PUBLIC_KEYS_PATH`; it does not trust public keys embedded in receipt JSON.

On a host with the runtime `data/` directory mounted, create a private archive with:

```bash
npm run backup:runtime -- --dry-run
npm run backup:runtime -- --output-dir /var/backups/fish
```

The archive and manifest are written with owner-only permissions. They may include API ledgers, provider proof signing keys, wallet intent rows, payout rows, and user submissions, so keep them off public storage. Restore by stopping Fish, extracting the archive from the repository root or deployed app root, checking ownership, then restarting Fish:

Use an absolute private target such as `/var/backups/fish`. Do not write runtime backups into `public/`, `data/`, a relative repository path, or temporary storage. The backup dry run includes a target safety section, and public-readiness checks flag unsafe targets.

```bash
systemctl stop fish-web
tar -xzf /var/backups/fish/fish-runtime-data-....tar.gz -C /opt/fish-web
chown -R fish:fish /opt/fish-web/data
systemctl start fish-web
```

## Signup Exports

Public forms write one JSON file per submission in `/app/data/submissions` inside the `fish-submissions` Docker volume. Support and refund tickets write JSON files to `/app/data/support` inside the `fish-support` Docker volume.

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
docker compose -f deploy/docker-compose.preview.yml --env-file .env.production exec fish-web \
  sh -lc 'ls -lah /app/data/support'
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
FISH_DATA_BACKUP_TARGET=
FISH_PROVIDER_ALLOWLIST=
FISH_PROVIDER_JOB_ENDPOINTS=
FISH_PROVIDER_JOB_API_KEY=
FISH_OCEAN_BATCH_ENDPOINT=
FISH_OCEAN_BATCH_API_KEY=
FISH_OCEAN_BATCH_PROVIDER_ID=ocean-batch-provider
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=30
FISH_OCEAN_BATCH_PRIVATE_PAYLOAD=false
FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS=600
FISH_DOCS_BATCH_MAX_COST_USD=1
FISH_CHAT_ROUTE=mock
FISH_CHAT_BACKEND=mock
FISH_MAX_INPUT_TOKENS=1000
FISH_MAX_OUTPUT_TOKENS=512
FISH_DAILY_KEYED_QUOTA=20
# Shared across unauthenticated meal-counter guests; API-key users get keyed quota above.
FISH_DAILY_ANONYMOUS_QUOTA=5
FISH_MAX_CONCURRENT_REQUESTS=8
FISH_RATE_LIMIT_MAX_BUCKETS=10000
# Granted once to the shared unauthenticated guest account, not once per browser.
FISH_GUEST_CREDIT_GRANT=25
# Required in production for unauthenticated meal and dish routes.
FISH_GUEST_ID_SALT=
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
FISH_PROVIDER_PROOF_PUBLIC_KEY_ID=
FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM=
FISH_PROVIDER_PROOF_PUBLIC_KEYS_JSON=
FISH_PROVIDER_PROOF_PUBLIC_KEYS_PATH=
FISH_PROVIDER_PROOF_SIGNING_KEY_ID=
FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM=
FISH_EXTERNAL_CHAT_BASE_URL=
FISH_EXTERNAL_CHAT_API_KEY=
FISH_EXTERNAL_CHAT_MODEL=
FISH_EXTERNAL_PROVIDER_ID=external-compatible
FISH_EXTERNAL_COST_USD_PER_1K_TOKENS=0
FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD=10
FISH_EXTERNAL_FALLBACK_FREE_ALLOWED=false
FISH_PUBLIC_APP_URL=https://op.fish
FISH_MIN_CHECKOUT_USD=1
FISH_MAX_CHECKOUT_USD=500
FISH_MAX_OUTSTANDING_PREPAID_CREDITS=100000
FISH_PAID_TOPUPS_PAUSED=true
FISH_BILLING_SUPPORT_URL=https://op.fish/support
FISH_BILLING_REFUND_POLICY_URL=https://op.fish/refunds
FISH_STRIPE_SECRET_KEY=
FISH_STRIPE_WEBHOOK_SECRET=
FISH_STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
FISH_STRIPE_TEST_MODE_ALLOWED=false
FISH_USDC_RECEIVE_ADDRESS=
FISH_USDC_RPC_URL=
FISH_USDC_CHAIN_ID=8453
FISH_USDC_TOKEN_ADDRESS=0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913
FISH_USDC_DECIMALS=6
FISH_USDC_MIN_CONFIRMATIONS=1
FISH_USDC_PAYMENT_TTL_MINUTES=60
FISH_STAKING_CREDIT_BUDGET=10000
FISH_STAKING_CREDITS_PER_OCEAN_MONTH=0.1
FISH_CONTRACT_CHAIN_ID=8453
FISH_CONTRACT_CHAIN_NAME=Base
FISH_CONTRACT_EXPLORER_URL=https://basescan.org
FISH_CONTRACT_RPC_URL=
FISH_CONTRACT_RPC_TIMEOUT_MS=4000
FISH_CONTRACT_ACTIONS_ENABLED=false
FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=false
FISH_CONTRACT_SETTLEMENT_CONFIRMATIONS=1
FISH_CONTRACT_MAINNET_WRITES_ALLOWED=false
FISH_CONTRACT_DEPLOYER_PRIVATE_KEY=
FISH_CONTRACT_OPERATOR_PRIVATE_KEY=
FISH_CONTRACT_OCEAN_TOKEN_ADDRESS=
FISH_CONTRACT_USDC_TOKEN_ADDRESS=0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913
FISH_CONTRACT_FISH_TOKEN_ADDRESS=
FISH_CONTRACT_OCEAN_STAKING_ADDRESS=
FISH_CONTRACT_CAPACITY_POOL_ADDRESS=
FISH_CONTRACT_TREASURY_ADDRESS=
FISH_CONTRACT_EMISSION_SOURCE_ADDRESS=
FISH_CONTRACT_OPERATOR_ADDRESS=
FISH_TRUST_PROXY_HEADERS=false
FISH_PROXY_HEADER_SECRET=
FISH_TESTNET_FAUCET_ENABLED=false
FISH_TESTNET_FAUCET_PRIVATE_KEY=
FISH_TESTNET_FAUCET_RPC_URL=https://sepolia.base.org
FISH_TESTNET_FAUCET_CHAIN_ID=84532
FISH_TESTNET_FAUCET_CHAIN_NAME=Base Sepolia
FISH_TESTNET_FAUCET_EXPLORER_URL=https://sepolia.basescan.org
FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS=
FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS=
FISH_TESTNET_FAUCET_ETH_AMOUNT=0.0005
FISH_TESTNET_FAUCET_ETH_LOW_BALANCE_THRESHOLD=0.0002
FISH_TESTNET_FAUCET_OCEAN_AMOUNT=1000
FISH_TESTNET_FAUCET_USDC_AMOUNT=25
FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS=24
FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS=24
FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS=50
FISH_TESTNET_FAUCET_CONFIRMATIONS=1
```

Set `FISH_ADMIN_TOKEN` to a unique long random secret in production-like environments before issuing prototype API keys. Public placeholder values such as `change-me-for-production` are rejected by the admin guard.
Set `FISH_PROVIDER_ALLOWLIST` or mount `data/provider_allowlist.json` when the first selected providers are approved.
Set `FISH_PROVIDER_JOB_ENDPOINTS=prov_abc=https://provider.example.com/fish/jobs` and optionally `FISH_PROVIDER_JOB_API_KEY` only when a selected provider has a private HTTP job adapter ready. Use only `http` or `https` endpoints on public-routable provider hosts; Fish rejects localhost, link-local, private-network, and credentialed URLs, validates DNS results before dispatch, and fails provider redirects instead of following them. Until then, keep provider proof on mock/sample data.
Set `FISH_OCEAN_BATCH_ENDPOINT` and optionally `FISH_OCEAN_BATCH_API_KEY` only when a private Oncompute/Ocean batch adapter is ready. Until then, `/api/ocean/batch/jobs` should stay in sample mode. Use `/api/ocean/batch/readiness` and `/proof` to verify that the adapter is reachable, live-ready, and backed by a successful non-sample receipt before claiming real Ocean workload proof.
Set `FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS` and `FISH_DOCS_BATCH_MAX_COST_USD` to cap Docs dish batch requests generated through `/v1/chat/completions`.
Plan-based per-minute and monthly request limits come from the Fish plan table. Minute limits and concurrent request caps are in-memory MVP guards, while monthly limits and daily quotas are backed by local usage/quota JSON.
Keep `FISH_CHAT_BACKEND=mock` for a no-secret local deployment. Set `FISH_CHAT_ROUTE=ocean-provider`, `FISH_OCEAN_PROVIDER_BASE_URL`, `FISH_OCEAN_PROVIDER_API_KEY`, and `FISH_OCEAN_PROVIDER_MODEL` only when a selected Ocean provider or Fish Runner `/v1` endpoint is ready. Set `FISH_CHAT_BACKEND=external`, `FISH_EXTERNAL_CHAT_BASE_URL`, `FISH_EXTERNAL_CHAT_API_KEY`, and `FISH_EXTERNAL_CHAT_MODEL` only when you explicitly want `/v1/chat/completions` to call an outside OpenAI-compatible backend, including as fallback from an Ocean route. External credentials alone are ignored while the backend selector stays mock.

Paid credit checkout is disabled until secrets are set, `FISH_MAX_OUTSTANDING_PREPAID_CREDITS` is configured, and `FISH_BILLING_SUPPORT_URL` plus `FISH_BILLING_REFUND_POLICY_URL` point to public-safe HTTP(S) or mailto links. The example env uses `https://op.fish/support` and `https://op.fish/refunds` while paid top-ups stay paused. For card checkout, set `FISH_STRIPE_SECRET_KEY`, `FISH_STRIPE_WEBHOOK_SECRET`, and `FISH_PUBLIC_APP_URL`, then configure Stripe webhooks for `/api/billing/webhooks/stripe`. Paid-mainnet readiness expects a live-mode Stripe key such as `sk_live_...` or `rk_live_...`; production checkout rejects `sk_test_...` and `rk_test_...` unless `FISH_STRIPE_TEST_MODE_ALLOWED=true` is set for a private test. `FISH_PUBLIC_APP_URL` must be the public HTTPS Fish origin, for example `https://op.fish`; localhost/default return URLs are not launch-ready. For USDC checkout, set a non-zero `FISH_USDC_RECEIVE_ADDRESS` and an HTTP(S) Base mainnet `FISH_USDC_RPC_URL`; Fish verifies Base USDC transfer logs before issuing prepaid credits. Keep `FISH_MIN_CHECKOUT_USD`, `FISH_MAX_CHECKOUT_USD`, and the prepaid liability cap conservative. Set `FISH_PAID_TOPUPS_PAUSED=true` to stop new paid checkout requests without disabling existing balances.

Contract status is read-only by default. Set the `FISH_CONTRACT_*` addresses and `FISH_CONTRACT_RPC_URL` after deploying the prototype contracts on a testnet. Keep `FISH_CONTRACT_ACTIONS_ENABLED=false` until the addresses, chain, roles, and test wallet path are reviewed. Keep `FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=false` until the operator wallet, USDC funding, allowance path, and idempotency process are tested. Keep `FISH_CONTRACT_MAINNET_WRITES_ALLOWED=false` unless the contracts have passed audit, legal review, multisig ownership, monitoring, and incident-response checks.

The testnet faucet is disabled by default. Enable it only on Base Sepolia with a dedicated low-balance faucet wallet. Do not reuse deployer, operator, treasury, Ocean proof, or production payment wallets. Keep `FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS`, wallet cooldown, IP cooldown, and token amounts conservative. In production, faucet claims fail closed unless `FISH_TRUST_PROXY_HEADERS=true`, `FISH_PROXY_HEADER_SECRET` is set to a long random secret, and the trusted nginx/private proxy strips any incoming `x-fish-proxy-secret` header before adding its own `x-fish-proxy-secret` and client IP headers.

Once test token contracts exist, generate the private web-app faucet overlay with:

```bash
npm run secrets:public-testnet -- \
  --include-wallets \
  --include-faucet \
  --contract-deployment contracts/deployments/<base-sepolia>.local.json \
  --faucet-rpc-url https://sepolia.base.org
```

Paste the generated app env block into the private web-host env file. The faucet private key belongs to the web app because `/api/testnet/faucet` signs claims; it should not be copied into `.env.ocean-demo-stack`. When `--contract-deployment` is present, the generator reads the deployed test OCEAN/Test USDC addresses from the ignored contract deployment artifact.

For Base Sepolia contract testing:

```bash
BASE_SEPOLIA_RPC_URL=https://... \
FISH_CONTRACT_DEPLOYER_PRIVATE_KEY=0x... \
npm run contracts:deploy:testnet
```

The deploy script creates test OCEAN/test USDC when token addresses are not supplied, deploys FISH, the OCEAN staking proxy, and the Capacity Pool, grants the staking proxy the FISH minter/burner role, sets a simple mint curve, prints the web-app env block, and writes a local ignored deployment artifact.

Warm inference operations are covered in `docs/warm-inference-runbook.md`. The MVP path is a private vLLM endpoint, ideally behind Fish Runner, on a GPU host that may also run Ocean Node for provider identity and anchoring. Keep the warm route on mock until the private endpoint is ready, then switch `FISH_CHAT_ROUTE=ocean-demo-vllm` for the demo lane or `FISH_CHAT_ROUTE=ocean-provider` for selected provider testing. Check `/routing`, `/api/routing/policy`, and the public `/api/warm/status` snapshot after changing routes. The warm status snapshot should show `runnerReceiptTrust.configured=true` before signed runner receipts are counted as proof. Use `/api/warm/status?probe=live` with `x-fish-admin-token` only for operator live probes.

## GPU Ocean Demo Stack

For public testnet demos, keep the web VM small and run the GPU/Ocean side on a separate dedicated VM:

```bash
cp deploy/ocean-demo-stack/env.example .env.ocean-demo-stack
node scripts/generate-ocean-node-compute-env.mjs --env
make ocean-demo-config FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
make ocean-demo-up FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

Use the warm profile when the same GPU VM should run vLLM and Fish Runner:

```bash
make ocean-demo-up-warm FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

On Apple Silicon, run MLX on the macOS host and use the MLX profile instead:

```bash
python3 -m venv .venv-mlx
source .venv-mlx/bin/activate
pip install -U mlx-lm
mlx_lm.server --model mlx-community/Llama-3.2-3B-Instruct-4bit --host 127.0.0.1 --port 8080
make ocean-demo-up-mlx FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

For the local website, point Fish Gateway at Fish Runner:

```text
FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://127.0.0.1:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<FISH_RUNNER_API_KEY>
FISH_OCEAN_DEMO_VLLM_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-local-mlx
```

The stack includes Ocean Node, Typesense, the private Ocean workload adapter, optional vLLM, and optional Fish Runner. It is intended to prove that test dishes can run through an Ocean Node operated by Ocean Navy without paying third-party Oncompute providers during early testing. It should not be described as proof of paid third-party Oncompute demand.

Keep these private by default:

```text
OCEAN_NODE_HTTP_BIND=127.0.0.1
OCEAN_NODE_P2P_BIND=127.0.0.1
OCEAN_WORKLOAD_ADAPTER_BIND=127.0.0.1
FISH_VLLM_BIND=127.0.0.1
FISH_RUNNER_BIND=127.0.0.1
FISH_MLX_BASE_URL=http://host.docker.internal:8080/v1
```

Expose Fish Runner and the adapter only through a private network, WireGuard, SSH tunnel, cloud private IP, or nginx allowlist. Keep Ocean Node P2P localhost-bound for private proof runs, and only bind it to a reachable interface when the node is intentionally joining a P2P network. Never expose raw vLLM or raw MLX publicly. Ocean Node mounts the Docker socket for compute execution, so this stack belongs on a dedicated VM with conservative free-job caps.

After the stack is running:

```bash
npm run secrets:public-testnet
scripts/smoke-ocean-demo-stack.sh .env.ocean-demo-stack
npm run readiness:public-testnet -- --env .env.production.example --app-env-overlay .env.production.private
npm run backup:runtime -- --dry-run
```

`npm run secrets:public-testnet` prints generated starter values for private env files. Keep the output out of git, tickets, and public chat. Use `--app-env-overlay .env.production.private` when auditing a production-like host from the public example env; the readiness command reports only states and findings, not secret values.
Use `--include-faucet --test-ocean-address 0x... --test-usdc-address 0x...` only after the Base Sepolia test tokens are deployed and the faucet wallet can be low-funded.

Then point the public web VM at the private GPU stack:

```text
FISH_OCEAN_BATCH_ENDPOINT=http://<private-gpu-vm-host>:8787/jobs
FISH_OCEAN_BATCH_API_KEY=<OCEAN_WORKLOAD_ADAPTER_API_KEY>
FISH_OCEAN_BATCH_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=5
FISH_OCEAN_BATCH_PRIVATE_PAYLOAD=true

FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<private-gpu-vm-host>:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<FISH_RUNNER_API_KEY>
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=<small cap>
```

See `deploy/ocean-demo-stack/README.md` for the full runbook.

## Contract Testnet Operations

Use Node 22 for the deploy helper. Deploy the prototype contracts to Base Sepolia only:

```bash
BASE_SEPOLIA_RPC_URL=https://... \
FISH_CONTRACT_DEPLOYER_PRIVATE_KEY=0x... \
npm run contracts:deploy:testnet
```

The testnet helper uses short cooldowns by default so the complete wallet lifecycle can be checked in one session:

```text
FISH_TESTNET_FISH_COOLDOWN_SECONDS=300
FISH_TESTNET_OCEAN_COOLDOWN_SECONDS=300
FISH_TESTNET_MIN_UNSTAKE_BATCH_OPEN_SECONDS=60
```

The script prints the `FISH_CONTRACT_*` web-app env block and writes an ignored artifact under `contracts/deployments/`. To regenerate a private web-app overlay later, use:

```bash
npm run secrets:public-testnet -- \
  --contract-deployment contracts/deployments/<base-sepolia>.local.json
```

By default this keeps contract wallet actions disabled and makes `/api/contracts/status` read-only. Add `--enable-contract-actions` only after reviewing the testnet addresses, roles, and wallet flow. This public-testnet helper refuses to enable contract actions for Base mainnet.

Add the generated app env values to the app environment, restart the app, then verify:

```bash
curl -fsS http://127.0.0.1:3000/api/contracts/status
```

Expected testnet state after a successful configured read:

```text
dataState=live
onchain.readVerified=true
mode=testnet_actions when FISH_CONTRACT_ACTIONS_ENABLED=true
```

Server-submitted capacity settlements require:

```text
FISH_CONTRACT_RPC_URL
FISH_CONTRACT_OPERATOR_PRIVATE_KEY
FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true
FISH_ADMIN_TOKEN
```

Operator rules:

- Use a separate operator key from the deployer once the first smoke test passes.
- Keep the operator key in the server environment only; never commit it or place it in browser-exposed `NEXT_PUBLIC_*` variables.
- Include a stable `idempotencyKey` for every onchain settlement. Reusing the same key must return the existing record and must not submit a second transaction.
- Treat RPC mismatch, missing operator role, missing private key, and disabled settlement submit as fail-closed states.
- If a transaction is submitted but the HTTP request fails before the response returns, check the chain and local settlement records before retrying. Retry with the same `idempotencyKey`.
- Monitor operator USDC balance and allowance. The route approves USDC when needed, but the operator wallet must hold the settled USDC amount.
- Keep `FISH_CONTRACT_MAINNET_WRITES_ALLOWED` unset until audit, legal review, multisig ownership, and an incident-response runbook are complete.

Prototype wallet lifecycle to test on `/credits`:

```text
approve OCEAN
stake OCEAN
mint FISH
approve FISH
stake FISH capacity
record paid USDC usage through /api/proof/capacity-settlements
claim USDC
queue FISH capacity exit
flush capacity batch
claim FISH batch after cooldown
burn FISH
start OCEAN exit
finish OCEAN exit after cooldown
```

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
- `/api/proof/payouts` with `x-fish-admin-token`
- `/api/proof/payouts?state=accrued&limit=10` with `x-fish-admin-token`
- `/api/proof/capacity-settlements`
- `/api/contracts/status`
- `/api/billing/plans`
- `/api/billing/checkout/stripe` with a Fish API key when Stripe env is configured
- `/api/billing/checkout/usdc` with a Fish API key when USDC env is configured
- `/api/billing/subscriptions` with `x-fish-admin-token`
- `/api/billing/topups` with `x-fish-admin-token`
- `/api/billing/usage-analytics` with `x-fish-admin-token`
- `/api/ocean/refresh` with `x-fish-admin-token`
- `/api/routing/policy`
- `/api/warm/status` snapshot and `/api/warm/status?probe=live` with `x-fish-admin-token` for operator live probes
- `/api/ocean/batch/readiness`
- `/api/staking/summary`
- `/api/staking/wallet-intents`
- `/api/submissions/export?format=csv` with `x-fish-admin-token`
