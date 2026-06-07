# Public Testnet Launch Readiness

This is the working checklist for steps 2-10 on `main`: public/GPU deployment preparation, user-facing batch dishes, conservative proof claims, payments/mainnet readiness, public testnet UX, data hygiene, operational hardening, proof UX simplification, and the path to real Ocean/Oncompute proof.

## Goal

Let users test Fish without real funds while keeping claims honest:

```text
Fish can serve public testers with capped credits, optional testnet tokens, and local Ocean Node snapshot proof.
```

Do not claim paid third-party Oncompute demand until Fish runs a paid or externally supplied Oncompute job.

## Current Main-Branch State

With a generated private public-testnet overlay and private Ocean demo host, the expected non-gating advisory readiness shape is:

```text
ready=9 partial=0 blocked=0 manual=2
```

The two manual gates are expected and should remain visible in advisory reports; the default gate still exits non-zero until they are resolved or consciously reviewed in a non-gating context:

- `Payments/mainnet checkout`: waiting for real Stripe or canonical Base mainnet USDC configuration and an explicit unpause.
- `External Oncompute proof`: waiting for a live external Ocean/Oncompute job with algorithm DID, compute environment id, proof wallet/RPC, output hash/ref, and non-sample Fish receipt.

The default public example env intentionally reports more partial/manual items because it does not include private operator values.

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
npm run ocean-demo:web-env -- --env .env.ocean-demo-stack --host <private-gpu-vm-host> --profile mlx
npm run readiness:public-testnet -- --env .env.production.example --app-env-overlay .env.production.private --derive-ocean-web-env-host <private-gpu-vm-host> --derive-ocean-web-env-profile mlx
```

Paste the generated values into private env files only. The command prints admin tokens, adapter keys, runner signing keys, proof signing keys, salts, and optional throwaway wallet keys.
`npm run ocean-demo:web-env` prints the matching web-host env block for the private adapter, Fish Runner route, and runner receipt public key. Its output includes adapter and runner API keys, so paste it only into the private web host env.
`--app-env-overlay` lets the readiness audit merge a private app env file with the public example env without printing admin tokens, salts, proof keys, or PEM material.
`--derive-ocean-web-env-host` lets the readiness audit evaluate that generated web-host block without printing adapter keys, runner keys, or PEM material.
Use the GPU/Ocean host private IP or private DNS name for `--derive-ocean-web-env-host`. The readiness audit flags loopback hosts such as `127.0.0.1`, `localhost`, and `host.docker.internal` as partial for a public web VM because they would point the web app back at itself.
Faucet credentials belong in the private web-app env, not in the Ocean demo stack env. Add `--include-faucet` only when the Base Sepolia test token addresses are known, or pass `--contract-deployment contracts/deployments/<base-sepolia>.local.json` after the test contracts are deployed so the generator can read those addresses from the ignored artifact. Keep the faucet wallet intentionally low-funded.

The readiness script also audits the selected Ocean compute environment. `FISH_OCEAN_COMPUTE_ENV_ID` must match an environment inside `OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS`, and that environment must restrict `free.access.addresses` to exactly the Ocean proof wallet used by the workload adapter. Other free-access mechanisms, including non-empty `free.access.accessLists`, are treated as not public-testnet ready.

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

After the web app points at the private adapter, run a full Fish order smoke:

```bash
make fish-ocean-proof-smoke
```

This creates a temporary Ocean-capable Fish API key, submits one Docs Bento order through `/api/dishes/docs/run`, verifies the batch receipt is non-sample `ocean_http`, confirms `/api/ocean/batch/readiness` returns `proofReady=true`, and checks that `/proof` shows the conservative local Ocean proof boundary without rendering the raw smoke prompt. The command prints only public-safe ids, labels, and hashes. For local development without polluting the normal runtime ledgers, start the web app with temporary paths first:

```bash
FISH_LEDGER_DIR=/tmp/fish-e2e-ledger \
FISH_OCEAN_BATCH_DIR=/tmp/fish-e2e-ocean-batch \
npm run dev
```

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

Public Ocean readiness claims must be derived from the selected successful receipt's recorded `sourceState` and `adapterMode`, not only from the adapter's current health/config response. A snapshot `ocean_http` receipt may support the conservative Ocean Navy Ocean Node claim, but it must not be relabeled as an Ocean CLI ticket just because the adapter is later configured in live mode.

## Step 5: Payments/Mainnet Readiness

Paid credits should stay blocked until:

```text
FISH_MAX_OUTSTANDING_PREPAID_CREDITS is set
Stripe or USDC checkout secrets are set
USDC checkout uses Base mainnet chain id 8453, canonical Base USDC, a non-zero receive address, and an HTTP(S) Base mainnet RPC
FISH_BILLING_SUPPORT_URL and FISH_BILLING_REFUND_POLICY_URL are public-safe HTTP(S)/mailto links
contract writes outside Base Sepolia stay disabled unless explicitly reviewed
```

The example env points those customer-care links at `/support` and `/refunds`, and keeps paid top-ups paused. Support and refund tickets are private operator records under `data/support/`.

Use:

```bash
npm run readiness:public-testnet
curl -sS http://127.0.0.1:3000/api/billing/readiness
```

The default readiness profile is `public-testnet`. In that profile, intentionally paused paid checkout is reported as a manual follow-up because public testers are not using real money; the command still exits non-zero for that manual row so CI and operators cannot miss it.
`GET /api/billing/readiness` exposes only public-safe billing status: whether the prepaid liability cap is configured, whether support/refund links are ready, and whether checkout methods are enabled. It intentionally does not expose the exact cap in credits or USD, detailed payment-provider configuration, RPC URLs, or payment recipient addresses; operators should review private env values directly for launch liability decisions.

Before a paid launch, use the stricter profile:

```bash
npm run readiness:paid-mainnet
```

Paid-mainnet readiness can pass through either lane:

```text
Stripe lane: live-mode Stripe secret or restricted key + webhook secret + public HTTPS app URL
USDC lane: non-zero Base mainnet receive address + HTTP(S) Base mainnet RPC + canonical Base USDC
Both lanes: prepaid liability cap + support URL + refund policy URL + paid top-ups intentionally unpaused + FISH_STRIPE_TEST_MODE_ALLOWED=false
```

`FISH_STRIPE_TEST_MODE_ALLOWED=true` is only for private Stripe test-mode checks. The paid-mainnet readiness profile blocks while it is enabled, even if USDC checkout is the selected paid lane.

Do not use Base Sepolia for paid checkout. Base Sepolia belongs only to public tester faucet and contract playground flows.

If the paid-mainnet profile reports payments as blocked, keep:

```text
FISH_PAID_TOPUPS_PAUSED=true
FISH_STRIPE_TEST_MODE_ALLOWED=false
FISH_CONTRACT_ACTIONS_ENABLED=false
FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=false
FISH_CONTRACT_MAINNET_WRITES_ALLOWED=false
```

The contract/staking readiness check turns green only after the web env has a matching RPC URL plus all required deployment addresses:

```text
FISH_CONTRACT_OCEAN_TOKEN_ADDRESS
FISH_CONTRACT_USDC_TOKEN_ADDRESS
FISH_CONTRACT_FISH_TOKEN_ADDRESS
FISH_CONTRACT_OCEAN_STAKING_ADDRESS
FISH_CONTRACT_CAPACITY_POOL_ADDRESS
```

For public tester wallet actions, use Base Sepolia (`FISH_CONTRACT_CHAIN_ID=84532`). Mainnet writes remain a separate paid-mainnet milestone.

After `npm run contracts:deploy:testnet`, regenerate the private web-app overlay from the ignored deployment artifact:

```bash
npm run secrets:public-testnet -- \
  --contract-deployment contracts/deployments/<base-sepolia>.local.json \
  --include-wallets \
  --include-faucet
```

By default this produces a read-only contract status env. Add `--enable-contract-actions` only for Base Sepolia wallet testing after the deployed addresses, token funding, and test wallets are reviewed. This helper refuses to enable contract actions for Base mainnet.

## Step 6: Public Tester UX

For testers without funds:

```bash
npm run secrets:public-testnet -- \
  --include-wallets \
  --include-faucet \
  --contract-deployment contracts/deployments/<base-sepolia>.local.json \
  --faucet-rpc-url https://sepolia.base.org
```

Paste only the generated app env block into the private web-host env file, then fund the generated faucet address with limited Base Sepolia ETH, Test OCEAN, and Test USDC. Do not reuse deployer, operator, treasury, Ocean proof, or payment wallets for the faucet.

```text
FISH_TRUST_PROXY_HEADERS=true
FISH_PROXY_HEADER_SECRET=<long random secret set by nginx/private proxy>
FISH_TESTNET_FAUCET_ENABLED=true
FISH_TESTNET_FAUCET_CHAIN_ID=84532
FISH_TESTNET_FAUCET_PRIVATE_KEY=<dedicated low-balance faucet key>
FISH_TESTNET_FAUCET_RPC_URL=https://sepolia.base.org
FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS=<Base Sepolia Test OCEAN>
FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS=<Base Sepolia Test USDC>
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
`GET /api/testnet/faucet` is public-safe and shows only readiness, plain-language claim state, grant sizes, daily remaining claims, reset time, faucet balances, and token addresses. It must not show wallet hashes, IP hashes, private keys, or raw claim rows.
Successful and failed recorded faucet attempts count toward the daily, wallet, and IP limits. This is intentional: if a transfer path partially fails, the same wallet/IP should not be able to retry immediately and drain the faucet. The faucet also checks token balances before sending the optional ETH gas top-up.

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
data/support/
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

The readiness audit also checks repository hygiene before merge or public testing. It reports a manual finding if private runtime ledgers, local deployment artifacts, private env files, backups, nginx password files, provider allowlists, or proof signing keys are tracked by git, or if representative private paths stop being ignored.

## Step 8: Operational Hardening

Before a public tester link goes out:

```bash
npm run secrets:public-testnet
npm run verify
npm run proof:algorithm-smoke
npm run readiness:public-testnet
docker compose config >/tmp/fish-compose.yml
make ocean-demo-smoke FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
make fish-ocean-proof-smoke
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
selected Ocean compute environment free access is restricted to exactly the proof wallet
all private services bind to localhost/private network
repository hygiene is ready, with runtime ledgers and private env files ignored
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
`/api/ocean/batch/readiness` includes a public `claim` object that the proof page uses for this same boundary. Check `claim.level`, `claim.headline`, `claim.boundary`, and `claim.notClaimed` before sharing a proof link; they must stay conservative even when the adapter route is connected.

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

Before publishing the first algorithm DID, verify the prepared Docs Bento algorithm locally:

```bash
npm run proof:algorithm-smoke
```

This checks the no-dataset proof mode and a local text-dataset summary mode without using a wallet, RPC, Ocean CLI, or public proof ledger.

Before attempting the first external Ocean/Oncompute job, preflight the private adapter env:

```bash
cp .env.ocean-proof.example .env.ocean-proof.local
npm run proof:external-preflight -- --env-file .env.ocean-proof.local
```

The preflight exits without starting HTTP and prints public-safe selected values, missing fields, warnings, and booleans for whether secrets are configured. It must not print adapter keys, proof wallet secrets, mnemonics, or RPC URLs.
It also rejects malformed external proof configuration before an operator can mistake it for readiness: `FISH_OCEAN_DATASET_DIDS` must be `[]` or a JSON/comma-separated list of `did:op:...` values, `FISH_OCEAN_ALGO_DID` must be `did:op:...`, paid `FISH_OCEAN_RESOURCES` and optional `FISH_OCEAN_OUTPUT` must be JSON objects, `NODE_URL` must be an HTTP(S) URL or Ocean p2p/multiaddr locator without embedded credentials, and loopback RPCs such as `http://127.0.0.1:8545` do not count for external Oncompute proof.

The readiness audit has a separate `External Oncompute proof` gate for this. It remains manual for `local_ocean_node` mode or local/private `NODE_URL` values, even when the local demo stack is healthy. It turns ready only when the private workload adapter is in `live` mode with a strong adapter key, proof wallet, HTTP(S) RPC, non-local Ocean/Oncompute node URL, `FISH_OCEAN_DATASET_DIDS` (use `[]` for a self-contained first algorithm), `FISH_OCEAN_ALGO_DID`, `FISH_OCEAN_COMPUTE_ENV_ID`, and either `OCEAN_CLI_DIR` or `FISH_OCEAN_CLI_BIN`.

For paid external jobs, configure `FISH_OCEAN_PAYMENT_TOKEN` and valid JSON `FISH_OCEAN_RESOURCES` together. Leave both empty only when the selected external compute environment is intentionally free for the proof wallet.

## Audit Command

Run:

```bash
npm run secrets:public-testnet
npm run readiness:public-testnet
```

Optional:

```bash
npm run readiness:public-testnet -- --env .env.production.example --app-env-overlay .env.production.private --ocean-env .env.ocean-demo-stack --json
npm run readiness:public-testnet:advisory -- --env .env.production.example --app-env-overlay .env.production.private --ocean-env .env.ocean-demo-stack
npm run readiness:paid-mainnet -- --env .env.production.example --app-env-overlay .env.production.private --ocean-env .env.ocean-demo-stack
```

The default command exits non-zero for every non-ready state, including `partial` and `manual`, so every hardening item must be resolved before a public link or security-scan handoff. Use `npm run readiness:public-testnet:advisory` only for non-gating status reports that should exit non-zero for `blocked` rows alone. The command prints public-safe readiness states and never prints secrets. Keep `.env.production.private` outside git or in a secret-managed deploy path.
Each readiness row includes the matching step number from this checklist. The `Proof UX and claims` row covers steps 4 and 9 by checking that the readiness API exposes a conservative public `claim`, the proof page uses it, OpenAPI documents it, and the first public proof surface does not include raw setup labels.
