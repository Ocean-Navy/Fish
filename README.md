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
- `/privacy` with plain-language data handling rules for orders, proof tickets, providers, and future privacy modes.
- Waitlist/provider intake APIs that persist JSON submissions locally.
- Admin-only signup export for launch lead follow-up.
- Prototype `/v1` AI API with local API keys, Fish Credits debits, and usage receipts.
- `/ask` with a Fish meal counter: Ocean batch dishes (Docs Bento, Repo Roll, Eval Platter, Data Sushi) plus quick warm dishes.
- `/api/meal/order` for a globally capped guest meal-counter demo without exposing a Fish API key.
- `/api/warm/status` for public-safe warm Ocean demo configuration snapshots without endpoint URLs, secrets, or live backend probes.
- `/api/ocean/batch/jobs` for hash-only Ocean batch dish receipts, sample by default until a private batch adapter is configured.
- `/api/ocean/batch/readiness` for a public-safe Milestone 3 gate before claiming real Ocean workload proof.
- `/credits` with an EVM wallet intent flow for future OCEAN lock credits; this records interest but does not stake tokens or issue credits.
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

## Contributor And Agent Docs

For Ocean Navy contributors and coding agents, start here:

```text
AGENTS.md                    Repo-wide instructions for agentic coding tools
CONTRIBUTING.md              Human contribution workflow and PR checklist
SECURITY.md                  Security policy, review scope, and reporting guidance
AGENTIC_DEVELOPMENT_PLAN.md  Current work lanes and task routing guide
api/openapi.yaml             API contract for public and prototype routes
docs/                        Feature plans, runbooks, and implementation contracts
docs/codex-security-setup.md Codex Security cloud environment and scan setup
docs/non-gpu-publish-readiness.md What can ship before a GPU VM
docs/public-testnet-launch-readiness.md Public tester checklist for capped credits, payment gates, and Ocean proof
contracts/                   Prototype Solidity contracts for OCEAN/FISH and capacity-pool research
```

Before changing behavior, read the relevant source files and feature doc. Keep public copy clear that Fish is Ocean Navy-built, built on Ocean Protocol, and not official unless approved. Keep `live`, `snapshot`, `sample`, and `unavailable` data states distinct.

## License

Fish is licensed under the GNU Affero General Public License v3.0 or later. See `LICENSE`.

The AGPL keeps Fish open for network-service use: if someone modifies Fish and runs that modified version for users over a network, they must offer those users the corresponding source code under the same license.

Public deployments should include a visible source-code link to the deployed Fish repository or source archive.

Useful local routes:

```text
/
/dashboard
/proof
/routing
/privacy
/account
/ask
/api/health
/api/ocean/summary
/api/ocean/resources
/api/ocean/refresh
/api/ocean/batch/jobs
/api/ocean/batch/readiness
/api/billing/readiness
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
/api/proof/capacity-settlements
/api/contracts/status
/api/testnet/faucet
/api/staking/summary
/api/staking/wallet-intents
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
npm run contracts:compile
npm run contracts:test
npm run contracts:deploy:testnet
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
  -v opfish-forms:/app/data/forms \
  -v opfish-ledger:/app/data/fish \
  -v opfish-ocean-batch:/app/data/ocean-batch \
  -v opfish-proof:/app/data/proof \
  -v opfish-staking:/app/data/staking \
  opfish-web:latest
```

Or use Compose:

```bash
cp .env.production.example .env.production
docker compose up --build
```

Check health:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

The container runs the Next.js standalone server as a non-root user. Form submissions, prototype API ledger files, provider proof files, and offchain staking credit records are written to:

```text
/app/data/submissions
/app/data/forms
/app/data/fish
/app/data/ocean-batch
/app/data/proof
/app/data/staking
```

Compose mounts those paths as named volumes named `fish-submissions`, `fish-forms`, `fish-ledger`, `fish-ocean-batch`, `fish-proof`, and `fish-staking`.

The root Compose file reads `${FISH_ENV_FILE:-.env.production}` when present. Keep `FISH_ADMIN_TOKEN` set before exposing admin routes. For a public site before Fish Runner is configured, leave `FISH_CHAT_ROUTE=mock` so the meal counter labels itself as demo mode, or set `FISH_CHAT_PAUSED=true` to stop orders entirely.

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

### GPU Ocean Demo Stack

The public web VM can stay small. Run Ocean Node, the Ocean workload adapter, vLLM, and Fish Runner on a separate GPU VM:

```bash
cp deploy/ocean-demo-stack/env.example .env.ocean-demo-stack
node scripts/generate-ocean-node-compute-env.mjs --env
make ocean-demo-config FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
make ocean-demo-up FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

Add `--profile warm` through `make ocean-demo-up-warm` when the GPU host should also run vLLM and Fish Runner.

On Apple Silicon, run `mlx_lm.server` on the macOS host and start `make ocean-demo-up-mlx` instead. Docker will run Ocean Node, the adapter, and Fish Runner; Fish Runner calls MLX at `host.docker.internal:8080`.

This stack is for a testnet/free-compute demo using our own Ocean Node. It can prove that Fish dishes run through an Ocean Node we operate; it does not prove paid third-party Oncompute demand. Keep raw vLLM and the workload adapter private, and point the web VM only at the Fish Runner `/v1` surface plus the adapter `/jobs` endpoint over a private network.

See `deploy/ocean-demo-stack/README.md`.

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
FISH_PUBLIC_APP_URL=http://127.0.0.1:3000
FISH_MIN_CHECKOUT_USD=1
FISH_MAX_CHECKOUT_USD=500
FISH_MAX_OUTSTANDING_PREPAID_CREDITS=
FISH_PAID_TOPUPS_PAUSED=true
FISH_STRIPE_SECRET_KEY=
FISH_STRIPE_WEBHOOK_SECRET=
FISH_STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
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

Direct provider endpoints can be listed in:

```text
data/node_endpoints.txt
```

Treat these as private operator configuration. Public Ocean dashboard API responses redact exact endpoint URLs, raw payloads, and direct-node endpoint-derived labels while preserving source-state labels and normalized capacity metrics.

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

`FISH_CHAT_ROUTE=ocean-first`, `hybrid`, and `ocean-demo-vllm` all select the same warm demo route. Fish fails closed when that route is unconfigured or errors unless external fallback has also been explicitly selected with `FISH_CHAT_BACKEND=external`. When that operator opt-in, the account plan, and fallback budget all allow fallback, the response and receipt keep the final route plus `requestedRoute`, `fallbackFrom`, and `fallbackReason` so external use is visible before any deployment claims it.

External fallback is separate, must be explicitly selected, and should stay capped:

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

Fish stores usage numbers, route metadata, latency, cost estimates, and request hashes in local receipts. It does not store raw prompts or outputs in receipts, public proof, dashboards, billing rows, or exports. The raw prompt is still sent to the configured backend when that route needs it to answer, so that backend's privacy policy applies. The public data-handling page is available at `/privacy`.

Feature caps are layered under the global token limits. For example, Code can have a larger cap than Ask when `FISH_MAX_OUTPUT_TOKENS` is raised, while Images remain disabled until a paid image route exists.

Unauthenticated meal and dish routes use one deployment-scoped anonymous guest identity for quota and demo credit accounting. `FISH_GUEST_ID_SALT` separates that bucket between deployments and is required in production; guest routes return `503 guest_identity_salt_required` until it is set. Fish does not trust client-supplied proxy headers such as `X-Forwarded-For` or `X-Real-IP` for guest credit grants.

The public route compass shows what is active without exposing secrets:

```bash
curl -sS http://127.0.0.1:3000/api/routing/policy
curl -sS http://127.0.0.1:3000/api/warm/status
# Operator-only live probe; requires FISH_ADMIN_TOKEN outside local development.
curl -sS -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" "http://127.0.0.1:3000/api/warm/status?probe=live"
```

`/api/warm/status` also reports whether trusted Fish Runner receipt public keys are configured. It exposes only counts and warnings, never public key material or private keys. Runner receipts do not count as signed proof until at least one trusted Ed25519 runner public key is configured.

Use `/routing` for the human-friendly route view and `/dashboard` for public warm demo snapshots. Both must label mock, external fallback, selected warm demo work, and later selected Ocean provider work differently.

For the warm inference MVP, see `docs/warm-inference-runbook.md`, `docs/vllm-oncompute-runner-profiles.md`, and `deploy/ocean-demo-stack/README.md`. The practical first deployment is a GPU host with vLLM kept warm behind Fish Gateway or Fish Runner, next to an Ocean Node and private Ocean workload adapter for test dishes. Keep the vLLM endpoint private, set `FISH_RUNNER_API_KEY` for Runner protected endpoints, cap usage, and do not claim paid third-party Oncompute demand or Ocean-native live chat until selected-provider routing and proof labels support that claim.

Create a pilot key:

```bash
curl -sS http://127.0.0.1:3000/v1/api_keys \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{"label":"Local pilot","creditGrant":1000,"planId":"free"}'
```

In local development, `FISH_ADMIN_TOKEN` may be empty. Set it to a unique long random secret in production before issuing keys; public placeholder values such as `change-me-for-production` are rejected by the admin guard.

List models:

```bash
curl -sS http://127.0.0.1:3000/v1/models
```

Core dish aliases are listed as models too: `fish-ask`, `fish-code`, `fish-docs`, `fish-repo`, `fish-eval`, `fish-data`, `fish-ocean-helper`, `fish-clear-broth`, and `fish-proposal`. Passing one of these as `model` applies that dish's feature limits and receipt label even if you do not send `metadata.fish_feature`. `fish-ocean-helper` adds a small local Fish/Ocean context pack and returns its source labels in `fish.knowledgeSources`.

Fish rejects models that are not listed in the account plan before it spends quota, reserves credits, or calls a backend. Use `/v1/balance` or `/api/billing/plans` to see the current plan and allowed model IDs.

Send a chat request:

```bash
curl -sS http://127.0.0.1:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"model":"fish-ask","messages":[{"role":"user","content":"Explain Fish in one line"}]}'
```

Set `"stream": true` for OpenAI-style server-sent events. V0 streaming is compatibility streaming after Gateway has settled the request; true first-token streaming from Fish Runner is a later hardening step.

Before Fish calls a configured backend, Gateway reserves the maximum estimated credits for the request and reserves the route's estimated provider spend against the daily route budget. In-flight route budget reservations are counted with completed receipts so concurrent calls cannot all pass the same daily budget preflight. Successful requests release unused credit reserve, debit measured usage, write the receipt, and then release the in-flight route budget reservation; backend failures release the credit and route budget reservations without recording a usage charge.

Check balance, credit lanes, and receipts:

```bash
curl -sS http://127.0.0.1:3000/v1/balance -H "authorization: Bearer $FISH_API_KEY"
curl -sS http://127.0.0.1:3000/v1/usage -H "authorization: Bearer $FISH_API_KEY"
```

Add prepaid Fish Credits after checkout is configured and a prepaid liability cap is set:

```bash
curl -sS http://127.0.0.1:3000/api/billing/checkout/stripe \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"amountUsd":5}'
```

Set `FISH_STRIPE_SECRET_KEY`, `FISH_STRIPE_WEBHOOK_SECRET`, `FISH_PUBLIC_APP_URL`, and `FISH_MAX_OUTSTANDING_PREPAID_CREDITS`. Fish rejects checkout requests when paid top-ups are paused, when the cap is missing, or when the requested credits would exceed the cap. Configure Stripe to send signed webhooks to:

```text
https://<your-domain>/api/billing/webhooks/stripe
```

Fish accepts `checkout.session.completed`, verifies the Stripe signature, checks the session metadata against the local payment request, and grants `prepaid` credits idempotently by checkout session.

Use `GET /api/billing/readiness` to show public-safe payment state before checkout is enabled. It reports whether top-ups are paused, whether the prepaid liability cap is set in credits and USD exposure, and whether Stripe or USDC checkout is configured; it does not expose Stripe secrets, RPC URLs, or payment recipient addresses.

USDC checkout uses Base USDC by default:

```bash
curl -sS http://127.0.0.1:3000/api/billing/checkout/usdc \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"amountUsd":5,"payerAddress":"0x..."}'
```

Set `FISH_USDC_RECEIVE_ADDRESS`, `FISH_USDC_RPC_URL`, and `FISH_MAX_OUTSTANDING_PREPAID_CREDITS`. The default token is Base USDC at `0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913`. After sending the exact amount, confirm it:

```bash
curl -sS http://127.0.0.1:3000/api/billing/checkout/usdc/confirm \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{"paymentId":"pay_...","transactionHash":"0x..."}'
```

Fish verifies chain id, transaction success, confirmation count, token address, recipient address, and USDC amount before issuing credits. If `payerAddress` is supplied, Fish also requires the verified transfer sender to match it. The `/account` page can connect an injected EVM wallet and attach that address to the USDC payment request.

Plan metadata is visible in balances and in the public catalog:

```bash
curl -sS http://127.0.0.1:3000/api/billing/plans
```

Aggregate billing analytics are admin-only and do not include API keys or prompt/output text:

```bash
curl -sS -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" http://127.0.0.1:3000/api/billing/usage-analytics
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

The endpoint hides contacts, exact endpoints, private payout preferences, and operator notes. It exposes only public labels, status, capacity summary, allowlist constraints, and a Fish-ready checklist. Provider applications can include optional health endpoint, price hint, payout readiness, ops contact, approved runner/container, and no prompt/output logging policy fields. Public responses keep exact values private and use booleans, counts, and non-sensitive identifiers instead; private health endpoints are represented only as readiness status, never as endpoint URLs or endpoint hashes.

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

The HTTP adapter posts only `jobId`, `providerId`, `workloadType`, `model`, `inputRef`, `parameters`, `maxRuntimeSeconds`, and `maxCostUsd`; it does not send raw prompt or output text. Configure provider job endpoints as `http` or `https` URLs on public-routable hosts only: Fish rejects localhost, link-local, private-network, and credentialed URLs, resolves hostnames before dispatch, and does not follow provider redirects. Provider HTTP receipts are marked `snapshot` until a stronger Ocean-native job proof path exists. Successful non-sample selected-provider receipts get a canonical hash and an Ed25519 signature. The first run creates a local prototype signing key at `data/proof/signing-key.json`; keep that proof volume backed up if you want stable signing identity across deploys.

Public proof endpoints are:

```text
/api/proof/summary
/api/proof/receipts
/api/proof/providers
/api/proof/benchmarks
/api/proof/market-making
```

`/api/proof/summary` includes aggregate payout totals for the public dashboard, but it does not include per-provider payout rollups, event rows, batch rows, receipt references, payment timestamps, or payout filters. The detailed payout ledger is operator-only.

The receipt ledger supports `provider`, `providerId`, `status`, `backend`, `receiptType`, `signatureStatus`, `from`, `to`, and `limit` filters. Public receipt detail is available through each row's `detailUrl` and shows hashes, signature state, usage, cost, and timestamps without prompt or output text.

The operator payout summary at `GET /api/proof/payouts` requires `FISH_ADMIN_TOKEN` and supports `provider`, `providerId`, `state`, `eventType`, `sourceReceiptId`, `from`, `to`, and `limit` filters. It includes provider-level rollups, payable totals, excluded disputed/voided totals, and event rows that identify receipt-linked versus manual-adjustment sources.

Successful non-sample provider job receipts automatically create `job_accrued` payout events. Operator payout APIs redact the operator owner, operator reason, and transaction reference from the JSON summary; the admin CSV exports keep those details for settlement review.

Operators can inspect payout summaries, add manual payout events, create review batches, and export CSVs:

```bash
curl -sS 'http://127.0.0.1:3000/api/proof/payouts?state=accrued&limit=50' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN"

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

Provider job receipts, payout events, payout batches, capacity-pool settlement records, and the local prototype signing key are written under `data/proof/`, which is ignored by git and should be backed up or moved to a database/secret manager before public scale-up. Receipt signing uses `FISH_PROVIDER_PROOF_SIGNING_KEY_ID` and `FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM` when set; otherwise the first run creates a local proof signing key. Receipt verification trusts the configured signing key, the local proof signing key when present, or a pinned provider proof key configured with `FISH_PROVIDER_PROOF_PUBLIC_KEY_ID`/`FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM`, `FISH_PROVIDER_PROOF_PUBLIC_KEYS_JSON`, or `FISH_PROVIDER_PROOF_PUBLIC_KEYS_PATH`; it does not trust public keys embedded in receipt files.

For the public tester checklist, run:

```bash
npm run secrets:public-testnet
npm run readiness:public-testnet
npm run readiness:public-testnet -- --strict
npm run backup:runtime -- --dry-run
```

`npm run readiness:public-testnet` uses the no-real-money public-testnet profile by default. It treats intentionally paused paid checkout as a manual follow-up, not as a public-testnet blocker. Add `--strict` when every manual and partial item must be resolved. Before paid Stripe/USDC launch, run `npm run readiness:public-testnet -- --profile paid-mainnet`. `npm run secrets:public-testnet` prints generated starter values for private env files; it includes secrets and should not be committed or pasted into public notes. See `docs/public-testnet-launch-readiness.md`.

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

Public staking responses expose aggregate credit and OCEAN totals plus opaque position records only. They do not publish holder labels, wallet hash prefixes, exact per-position stake metadata, or per-account credit balances unless a future explicit disclosure flow is added.

The `/credits` page also has a browser-wallet intent flow. It asks a holder to connect an EVM wallet, sign a plain-language OCEAN credit intent, and records only public-safe hashes plus an estimated credit amount:

```text
GET  /api/staking/wallet-intents
POST /api/staking/wallet-intents
```

Wallet intents do not issue credits and do not stake OCEAN. They are a bridge toward a real lock contract or operator verification flow.

The `/credits` page also exposes the contract prototype status from:

```text
/api/contracts/status
```

By default this is read-only. Configure `FISH_CONTRACT_*` addresses and `FISH_CONTRACT_RPC_URL` after a testnet deployment. The status endpoint reads live totals from the configured contracts when RPC is available. Wallet write buttons remain disabled unless `FISH_CONTRACT_ACTIONS_ENABLED=true`, and Base mainnet writes stay blocked unless `FISH_CONTRACT_MAINNET_WRITES_ALLOWED=true`. Do not enable mainnet writes before audit, legal review, multisig ownership, and an incident-response runbook.

Deploy a Base Sepolia test system with:

```bash
BASE_SEPOLIA_RPC_URL=https://... \
FISH_CONTRACT_DEPLOYER_PRIVATE_KEY=0x... \
npm run contracts:deploy:testnet
```

If no `FISH_CONTRACT_OCEAN_TOKEN_ADDRESS` or `FISH_CONTRACT_USDC_TOKEN_ADDRESS` is set, the deploy script creates test OCEAN and test USDC tokens so the full flow can be tested without real assets. The script prints a web-app env block and writes a local ignored artifact under `contracts/deployments/`.

Paid demand that is settled into the FISH Capacity Pool can be recorded by an operator:

```bash
curl -sS http://127.0.0.1:3000/api/proof/capacity-settlements \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{
    "grossUsdcAmount":100,
    "netUsdcAmount":90,
    "operatorFeeUsdc":10,
    "settlementSource":"api_subscription",
    "idempotencyKey":"capacity-settlement-2026-06-04-001",
    "transactionHash":"0x1111111111111111111111111111111111111111111111111111111111111111"
  }'
```

To submit the actual capacity-pool transaction from the server, configure `FISH_CONTRACT_RPC_URL`, `FISH_CONTRACT_OPERATOR_PRIVATE_KEY`, `FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true`, and include `"submitOnchain": true`. The route checks that the operator wallet is authorized by the capacity pool, approves USDC when needed, calls `recordPaidUsage`, waits for confirmations, then records the public-safe settlement row. `idempotencyKey` is required for onchain submission to prevent accidental duplicate submits.

Capacity settlements are public-safe snapshot records unless submitted through the configured operator wallet. They are shown on `/proof`, `/dashboard`, `/api/dashboard/summary`, and through `GET /api/proof/capacity-settlements`.

The `/credits` contract panel supports the complete prototype testnet lifecycle:

```text
approve OCEAN
stake OCEAN
mint FISH
approve FISH
stake FISH capacity
claim USDC
queue FISH capacity exit
flush capacity batch
claim FISH batch
burn FISH
claim OCEAN rewards
start OCEAN exit
finish OCEAN exit
```

Use the batch ID shown in `/api/contracts/status` or on the `/credits` panel when claiming a capacity withdrawal batch. The capacity batch must be flushed and then wait through the FISH cooldown before claiming. The OCEAN exit must also wait through the OCEAN cooldown before final withdrawal.

The `/credits` page includes a Base Sepolia playground faucet when enabled. It sends a tiny gas top-up plus Test OCEAN and Test USDC from a dedicated faucet wallet:

```bash
curl -sS http://127.0.0.1:3000/api/testnet/faucet
curl -sS http://127.0.0.1:3000/api/testnet/faucet \
  -H 'content-type: application/json' \
  -d '{"walletAddress":"0x..."}'
```

Keep this wallet separate from deployer, operator, and treasury wallets. Fund it only with limited Base Sepolia ETH and test tokens. The faucet is disabled by default, Base Sepolia only, and capped by wallet, IP, and daily claim limits. Public status exposes safe aggregate counters only: enabled/ready state, grant sizes, wallet/IP/day limits, claims used today, remaining claims, reset time, token addresses, faucet address, and faucet balances. It does not expose wallet hashes, IP hashes, private keys, or raw claim rows.

Staking positions and wallet intents are written under `data/staking/`, which is ignored by git. This is not an onchain staking contract; it is a funded-budget prototype for proving OCEAN lock intent, credit issuance, and credit spend.

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

The Ocean batch dish contract is available at:

```text
GET /api/ocean/batch/jobs
POST /api/ocean/batch/jobs
GET /api/ocean/batch/readiness
```

`POST` requires a Fish API key and accepts hash/reference input through `inputRef`. `adapterMode: "sample_success"` is the default local proof mode. Set `adapterMode: "ocean_http"` only when `FISH_OCEAN_BATCH_ENDPOINT` points to a private Oncompute/Ocean batch adapter, and only Ocean-provider-eligible plans can use that live adapter. For `adapterMode: "ocean_http"`, Fish atomically reserves `maxCostUsd` against `FISH_OCEAN_BATCH_DAILY_BUDGET_USD`, requires enough Fish Credits to cover the selected live cost cap before execution, and debits successful live jobs by at least verified provider cost. Sample/prototype receipts do not count against the real Ocean daily spend cap. Public proof must show tickets and hashes, not raw order data.

Batch dishes sent through `/v1/chat/completions` or `/api/dishes/:dishId/run` use the same hash-only batch path by default and require an authenticated Fish API key on a plan allowed to use Ocean provider capacity. Guest meal-counter credits cannot start Ocean batch adapter work. Set `FISH_OCEAN_BATCH_PRIVATE_PAYLOAD=true` only for a private Ocean batch adapter we operate; then short raw dish text is sent to the adapter so the Ocean job can create a returned Markdown/HTML artifact. The returned artifact is shown to the user but not stored in public receipts.

| Dish | Model alias | Batch task |
| --- | --- | --- |
| Docs Bento | `fish-docs` | `document_summary` |
| Repo Roll | `fish-repo` | `structured_extraction` |
| Eval Platter | `fish-eval` | `batch_chat` |
| Data Sushi | `fish-data` | `embeddings` |

Per-dish runtime and cost caps can be set with `FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS`, `FISH_DOCS_BATCH_MAX_COST_USD`, `FISH_REPO_BATCH_MAX_RUNTIME_SECONDS`, `FISH_REPO_BATCH_MAX_COST_USD`, `FISH_EVAL_BATCH_MAX_RUNTIME_SECONDS`, `FISH_EVAL_BATCH_MAX_COST_USD`, `FISH_DATA_BATCH_MAX_RUNTIME_SECONDS`, and `FISH_DATA_BATCH_MAX_COST_USD`.

Batch receipts are written under `data/ocean-batch/`, and successful jobs also write Fish usage receipts so the public dashboard can count them as Ocean-backed usage. For public testing without external Oncompute payments, run the GPU-side Ocean demo stack and use free compute on our own Ocean Node. See `docs/ocean-batch-jobs-plan.md` for the adapter contract.

`/api/ocean/batch/readiness` and `/proof` show whether the private adapter is configured, reachable, live-ready, and backed by at least one successful non-sample Ocean batch receipt. The readiness response exposes booleans and blockers only; it does not expose adapter URLs, wallet secrets, API keys, prompt text, or output text.

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
deploy/ocean-demo-stack/     GPU VM Ocean Node, workload adapter, vLLM, and runner stack
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
- AGPLv3-or-later license text is present in `LICENSE`.
- `/api/health` returns `ok: true`.
- `/` is visually clear on mobile and desktop.
- `/dashboard` loads with live data or sample fallback.
- `data/submissions` is persisted or integrated with a real intake system.
- `npm run backup:runtime -- --dry-run` shows the expected runtime paths, and a private backup target is configured before public traffic.
- Public copy keeps the status clear: Ocean Navy-built, on Ocean Protocol, not official unless approved.
