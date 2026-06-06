# Public Testnet Launch Readiness

This is the working checklist for steps 2-10 before the next merge/security-scan pass.

## Goal

Let users test Fish without real funds while keeping claims honest:

```text
Fish can serve public testers with capped credits, optional testnet tokens, and local Ocean Node snapshot proof.
```

Do not claim paid third-party Oncompute demand until Fish runs a paid or externally supplied Oncompute job.

## Step 2: Public/GPU Deployment Preparation

The public web VM can stay small. The GPU/Ocean host runs:

```text
Ocean Node
Typesense
Ocean workload adapter
Fish Runner
vLLM or host MLX
```

Use:

```bash
cp deploy/ocean-demo-stack/env.example .env.ocean-demo-stack
npm run secrets:public-testnet
make ocean-demo-up-mlx FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
make ocean-demo-smoke FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

Paste the generated values into private env files only. The command prints admin tokens, adapter keys, runner signing keys, proof signing keys, salts, and optional throwaway wallet keys.

The readiness script also audits the selected Ocean compute environment. `FISH_OCEAN_COMPUTE_ENV_ID` must match an environment inside `OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS`, and that environment must restrict `free.access.addresses` to the Ocean proof wallet used by the workload adapter.

It also audits the selected public chat route. `mock` is allowed only as a clearly labeled preview. If `FISH_CHAT_ROUTE` selects `ocean-first`, `ocean-demo-vllm`, `ocean-provider`, or `external-fallback`, the matching private base URL, API key, model, and daily budget must be configured or the readiness gate blocks.

For a public tester deployment, keep sensitive services private:

```text
OCEAN_NODE_HTTP_BIND=127.0.0.1 or private network only
OCEAN_NODE_P2P_BIND=127.0.0.1 unless intentionally joining P2P
OCEAN_WORKLOAD_ADAPTER_BIND=127.0.0.1 or private network only
FISH_RUNNER_BIND=127.0.0.1 or private network only
FISH_VLLM_BIND=127.0.0.1 or private network only
```

Connect the web VM to the GPU/Ocean host with WireGuard, a private cloud network, an SSH tunnel, or an nginx allowlist. Never expose raw vLLM, raw MLX, or the workload adapter directly.

## Step 3: User-Facing Batch Dishes

The four batch dishes are:

| Dish | Task | Output |
| --- | --- | --- |
| Docs Bento | `document_summary` | short brief |
| Repo Roll | `structured_extraction` | codebase map |
| Eval Platter | `batch_chat` | scorecard |
| Data Sushi | `embeddings` | searchable chunks |

For useful public tester results, set:

```text
FISH_OCEAN_BATCH_ENDPOINT=<private adapter /jobs URL>
FISH_OCEAN_BATCH_API_KEY=<adapter key>
FISH_OCEAN_BATCH_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_BATCH_PRIVATE_PAYLOAD=true
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=<small cap>
```

Public proof still stores only hashes, ids, usage, source labels, and cost fields. The returned dish text is shown to the user but is not written into public proof.

## Step 4: Conservative Proof Claims

Allowed public claim after local Ocean Node receipts:

```text
Fish can run test dishes through an Ocean Node operated by Ocean Navy.
```

Not allowed yet:

```text
Paid third-party Oncompute demand is proven.
Fish has live Ocean-backed inference for all users.
Staking funds compute by itself.
Public proof stores or verifies raw answers.
```

Use the source labels:

```text
sample     local fake/sample path
snapshot   private adapter or local Ocean Node proof
live       confirmed live/onchain or stronger externally verifiable data
```

## Step 5: Payments/Mainnet Readiness

Paid credits should stay blocked until:

```text
FISH_MAX_OUTSTANDING_PREPAID_CREDITS is set
Stripe or USDC checkout secrets are set
FISH_BILLING_SUPPORT_URL and FISH_BILLING_REFUND_POLICY_URL are public-safe HTTP(S)/mailto links
mainnet contract writes stay disabled unless explicitly reviewed
```

Use:

```bash
npm run readiness:public-testnet
curl -sS http://127.0.0.1:3000/api/billing/readiness
```

The default readiness profile is `public-testnet`. In that profile, intentionally paused paid checkout is acceptable because public testers are not using real money. It still reports the missing Stripe/USDC/liability-cap work as manual follow-up.
`GET /api/billing/readiness` exposes the prepaid liability cap in both credits and USD exposure, plus support/refund readiness. Use the USD field for launch review because it is the real maximum prepaid liability if checkout is opened.

Before a paid launch, use the stricter profile:

```bash
npm run readiness:public-testnet -- --profile paid-mainnet
```

If the paid-mainnet profile reports payments as blocked, keep:

```text
FISH_PAID_TOPUPS_PAUSED=true
FISH_CONTRACT_ACTIONS_ENABLED=false
FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=false
FISH_CONTRACT_MAINNET_WRITES_ALLOWED=false
```

## Step 6: Public Tester UX

For testers without funds:

```text
FISH_TRUST_PROXY_HEADERS=true
FISH_PROXY_HEADER_SECRET=<long random secret set by nginx/private proxy>
FISH_TESTNET_FAUCET_ENABLED=true
FISH_TESTNET_FAUCET_CHAIN_ID=84532
FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS=<small cap>
FISH_TESTNET_FAUCET_ETH_AMOUNT=0.0005
FISH_TESTNET_FAUCET_OCEAN_AMOUNT=1000
FISH_TESTNET_FAUCET_USDC_AMOUNT=25
FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS=24
FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS=24
```

Fund the faucet wallet only with limited Base Sepolia ETH, Test OCEAN, and Test USDC.
In production, faucet claims require a trusted proxy identity. Configure nginx or the private proxy to strip any user-supplied `x-fish-proxy-secret`, then set its own `x-fish-proxy-secret: <FISH_PROXY_HEADER_SECRET>` plus the client IP header. Without that, Fish refuses faucet claims instead of trusting spoofable browser-supplied proxy headers.
For public testing, keep the daily claim cap at or below 100 claims, the ETH grant at or below 0.001 Base Sepolia ETH, the Test OCEAN grant at or below 10,000, the Test USDC grant at or below 100, and both wallet/IP cooldowns at one hour or longer. The readiness script reports larger limits as unsafe for a public tester faucet.
`GET /api/testnet/faucet` is public-safe and shows only readiness, grant sizes, daily remaining claims, reset time, faucet balances, and token addresses. It must not show wallet hashes, IP hashes, private keys, or raw claim rows.

## Step 7: Data Hygiene

Before public testing, configure a backup target or move ledgers to a managed database:

```text
FISH_DATA_BACKUP_TARGET=<operator backup target or runbook reference>
FISH_PROVIDER_PROOF_SIGNING_KEY_ID=<stable proof key id>
FISH_PROVIDER_PROOF_SIGNING_PRIVATE_KEY_PEM=<stable proof signing private key>
FISH_PROVIDER_PROOF_PUBLIC_KEY_ID=<same stable proof key id>
FISH_PROVIDER_PROOF_PUBLIC_KEY_PEM=<stable proof public key>
```

Back up:

```text
data/fish/
data/ocean-batch/
data/proof/
data/staking/
data/submissions/
data/forms/
```

Check the backup set before publishing:

```bash
npm run backup:runtime -- --dry-run
```

Create a private archive on the host:

```bash
npm run backup:runtime -- --output-dir /var/backups/fish
```

The archive can contain proof signing keys, API ledger data, payout records, wallet intent rows, and user submissions. Keep it private and restrict filesystem permissions.

Use an absolute private target such as `/var/backups/fish`. Do not point `FISH_DATA_BACKUP_TARGET` at `public/`, `data/`, a relative repository path, or temporary storage. The readiness audit and backup dry run report these target risks before public traffic.

Keep raw prompts and outputs out of public proof, dashboards, billing rows, and exports.

## Step 8: Operational Hardening

Before a public tester link goes out:

```bash
npm run secrets:public-testnet
npm run verify
npm run readiness:public-testnet
docker compose config >/tmp/fish-compose.yml
make ocean-demo-smoke FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

Also verify:

```text
admin token is not a placeholder
guest salt is set
production guest routes return `503 guest_identity_salt_required` until the guest salt is set
daily budgets are low
selected chat route has its private endpoint, API key, model, and budget
adapter key is not a placeholder
runner and proof signing keys are configured
selected Ocean compute environment free access is restricted to the proof wallet
all private services bind to localhost/private network
nginx/TLS is active on the public web host
```

`GET /api/warm/status` shows `runnerReceiptTrust.configured`, `trustedKeyCount`, and `invalidKeyCount` without exposing key material. Do not count Fish Runner receipts as signed proof until that status is configured and warnings are clear.

## Step 9: Proof UX

The public `/proof` page should start with normal-user language:

```text
What is proven?
Ocean batch proof is snapshot evidence from our local Ocean Node.
```

Detailed receipts, provider payouts, benchmarks, and capacity-pool rows belong below the fold or in JSON/API links.
Keep raw setup labels such as node URL, environment id, algorithm DID, dataset DID, adapter mode, and free-compute flags out of the first public proof surface. Public users should see whether Fish can serve a test dish through the Ocean path, whether a public-safe ticket exists, what source label applies, and what still needs to happen.

## Step 10: Real Ocean/Oncompute Proof Later

The next proof upgrade is:

```text
external Oncompute node or paid Ocean compute job
algorithm DID
dataset DID or no-dataset algorithm
payment token/resources
outputRef/outputHash
non-sample Fish receipt
```

Until then, keep the claim at local Ocean Node snapshot proof.

## Audit Command

Run:

```bash
npm run secrets:public-testnet
npm run readiness:public-testnet
```

Optional:

```bash
npm run readiness:public-testnet -- --env .env.production --ocean-env .env.ocean-demo-stack --json
npm run readiness:public-testnet -- --env .env.production --ocean-env .env.ocean-demo-stack --strict
npm run readiness:public-testnet -- --profile paid-mainnet --env .env.production --ocean-env .env.ocean-demo-stack
```

The default command exits non-zero only for blocked states. Use `--strict` when every manual and partial item must be resolved before a public link or security-scan handoff. The command prints public-safe readiness states and never prints secrets.
