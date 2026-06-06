# First Real Ocean Workload Proof

## Goal

Prove the first real Fish workload on Ocean / Oncompute:

```text
Fish submits one actual Ocean / Oncompute workload job
Fish receives outputRef or outputHash
Fish writes a non-sample Ocean batch receipt
Fish writes a normal Fish usage receipt
Fish shows the evidence on /proof
```

This is different from a local Fish Runner smoke test. A local runner proves Fish can route to an OpenAI-compatible backend. This proof must show that an Ocean / Oncompute compute job actually ran.

## Current Fish State

Fish already has the Fish-side receipt path:

```text
POST /api/ocean/batch/jobs
src/lib/oceanBatch.ts
docs/ocean-batch-jobs-plan.md
```

The existing `ocean_http` adapter mode posts to:

```text
FISH_OCEAN_BATCH_ENDPOINT
```

If that endpoint returns a successful provider response, Fish will:

```text
write sourceState: "snapshot"
write adapterMode: "ocean_http"
write an ocean_batch_job_receipt
debit Fish credits on success
include the batch evidence on /proof
```

So the missing part is not the Fish receipt ledger. The missing part is the real Ocean / Oncompute job runner behind `FISH_OCEAN_BATCH_ENDPOINT`.

Fish also exposes a public-safe readiness gate:

```text
GET /api/ocean/batch/readiness
```

The readiness response checks whether the private adapter is configured, reachable, live-ready, and backed by at least one successful non-sample Ocean batch receipt. It exposes booleans and blockers only; it does not expose adapter URLs, wallet secrets, API keys, prompt text, or output text.

## What Is Needed

To run an actual Ocean compute job through the official Ocean CLI path, the operator needs:

```text
OCEAN_WORKLOAD_ADAPTER_API_KEY (unique secret, at least 32 characters)
PRIVATE_KEY or MNEMONIC
RPC
NODE_URL
dataset DID(s), or [] if the workload supports no input datasets
algorithm DID
compute environment id
max job duration
payment token and resources for paid jobs
optional output storage JSON
```

For free compute, the operator still needs:

```text
OCEAN_WORKLOAD_ADAPTER_API_KEY (unique secret, at least 32 characters)
PRIVATE_KEY or MNEMONIC
RPC
NODE_URL
dataset DID(s), or []
algorithm DID
compute environment id with free capacity
optional output storage JSON
```

No wallet/private key, RPC, node URL, DIDs, compute environment id, payment token, or output storage config was found in the local environment during this review.

## Recommended Proof Architecture

Do not run Ocean CLI directly inside the public Next.js web process.

Use a small private adapter worker:

```text
Fish API
  -> FISH_OCEAN_BATCH_ENDPOINT
  -> private Ocean workload adapter
  -> Ocean CLI / Ocean Node compute job
  -> outputRef or outputHash
  -> Fish receipt
```

The adapter worker can be a tiny internal service because Ocean compute jobs may be slow, may need wallet secrets, and may need local output handling. Keep those secrets out of the public web process.

Fish has this scaffold under:

```text
deploy/ocean-workload-adapter/
```

It supports:

```text
GET /healthz
GET /config
POST /jobs
```

`GET /config` and `POST /jobs` require `Authorization: Bearer <OCEAN_WORKLOAD_ADAPTER_API_KEY>`. The adapter rejects those requests when the key is missing or left at a known placeholder, and live readiness requires a unique API key with at least 32 characters.

Dry-run mode is the default and never returns a successful proof. Live mode shells out to the official Ocean CLI checkout, starts the selected compute job, downloads job results, hashes the result directory, and returns the hash as `outputRef`.

For the public testnet route, run our own Ocean Node on the GPU VM first:

```text
deploy/ocean-demo-stack/
```

This avoids paid third-party Oncompute jobs while still proving that Fish can submit a dish through an Ocean Node path. After the Ocean Node is running, use its local compute environments endpoint to copy the environment id:

```bash
curl -fsS http://127.0.0.1:8000/api/services/computeEnvironments | jq
```

For external Oncompute nodes later, use the public Oncompute environment discovery helper to select the node URL and compute environment id:

```bash
node scripts/discover-oncompute-envs.mjs --chain 8453 --free --limit 10
```

Then copy:

```text
nodeUrl -> NODE_URL
envId   -> FISH_OCEAN_COMPUTE_ENV_ID
```

Fish also has the first proof algorithm bundle under:

```text
deploy/ocean-workload-adapter/algorithms/fish-document-summary/
```

It can summarize text dataset files, but it also supports `FISH_OCEAN_DATASET_DIDS=[]` for the first no-dataset Ocean compute proof.

Before publishing the algorithm asset, smoke the reviewed local bundle:

```bash
npm run proof:algorithm-smoke
```

This runs the algorithm with no dataset and with a small local text dataset, then verifies the private proof receipt, output mode, document hash, and output hash. It does not contact Ocean, use a wallet, or write public proof.

The public-testnet readiness audit keeps the two proof claims separate. A local Ocean Node adapter can make the local proof path ready, but the `External Oncompute proof` check stays manual until the private adapter env is explicitly live and has a non-local `NODE_URL`, wallet, HTTP(S) RPC, dataset DID list, algorithm DID, compute environment id, and Ocean CLI checkout path or binary. Paid jobs must set both `FISH_OCEAN_PAYMENT_TOKEN` and valid JSON `FISH_OCEAN_RESOURCES`; leave both empty only for free external compute.

## Adapter Contract

Fish sends:

```json
{
  "jobId": "batch_job_...",
  "idempotencyKey": "batch_job_...",
  "taskType": "document_summary",
  "inputRef": "sha256:...",
  "estimatedInputTokens": 1200,
  "maxOutputTokens": 512,
  "maxRuntimeSeconds": 600,
  "maxCostUsd": 1
}
```

The adapter must return:

```json
{
  "jobId": "batch_job_...",
  "providerJobId": "ocean-job-id",
  "status": "succeeded",
  "usage": {
    "inputTokens": 1200,
    "outputTokens": 220,
    "gpuSeconds": 18,
    "items": 1
  },
  "cost": {
    "amount": 0.04,
    "currency": "USDC"
  },
  "outputRef": "sha256:result-ref"
}
```

Fish will reject successful adapter responses when:

```text
provider cost exceeds maxCostUsd
output tokens exceed maxOutputTokens
outputRef/outputHash is missing
adapter response is not valid JSON
adapter times out
```

## First Workload Recommendation

Use `document_summary` first.

Reason:

```text
already mapped to Docs Bento
already uses hash-only inputRef
batch execution is acceptable
easy to cap cost and runtime
easy to show proof without publishing raw text
```

The first algorithm can be intentionally simple:

```text
read input reference or a bundled sample
run an open-source summarizer/extractor
write result to configured output storage
return outputRef or outputHash
```

If storage is not ready, the adapter can hash the result locally and return only `outputHash` for the proof run, but the production path should use durable storage.

## Exact Execution Plan

1. Choose one live Oncompute environment from `https://api.oncompute.ai/envs`.
2. Publish the prepared `Fish Docs Bento Summary` algorithm to get `FISH_OCEAN_ALGO_DID`.
3. Choose input handling:
   - existing Ocean dataset DID;
   - public test dataset DID;
   - or `[]` if the algorithm is self-contained for the first proof.
4. Configure the private adapter worker with:

```text
PRIVATE_KEY=<dedicated proof wallet>
RPC=<chain RPC>
ADDRESS_FILE=<optional custom Ocean contracts address file>
NODE_URL=<selected Ocean node URL or p2p address>
FISH_OCEAN_DATASET_DIDS=<comma-separated DIDs or []>
FISH_OCEAN_ALGO_DID=<algorithm DID>
FISH_OCEAN_COMPUTE_ENV_ID=<environment id>
FISH_OCEAN_PAYMENT_TOKEN=<paid token, if paid>
FISH_OCEAN_RESOURCES=<JSON resources, if paid>
FISH_OCEAN_OUTPUT=<JSON output config, optional>
```

The selected RPC chain must be supported by the Ocean CLI contract address bundle, or `ADDRESS_FILE` must point at a custom address file for deployed Ocean contracts on that chain. The bundled Ocean CLI 2.0.0 addresses include Base mainnet (`8453`) but not Base Sepolia (`84532`), so Base Sepolia requires a custom `ADDRESS_FILE` before `publishAlgo` can work.

The adapter template lives at:

```text
deploy/ocean-workload-adapter/env.example
```

Copy it to an ignored private file:

```bash
cp deploy/ocean-workload-adapter/env.example .env.ocean-proof.local
```

Prepare the Ocean CLI checkout:

```bash
scripts/bootstrap-ocean-cli.sh
```

Use the printed path for:

```text
OCEAN_CLI_DIR=/Users/robin/Projects/opfish/.deps/ocean-cli
```

Publish the first Fish algorithm after `PRIVATE_KEY`, `RPC`, and `NODE_URL` are exported:

```bash
npm run proof:algorithm-smoke
commit="$(git rev-parse HEAD)"
export FISH_ALGORITHM_FILE_URL="https://raw.githubusercontent.com/Ocean-Navy/Fish/${commit}/deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py"
scripts/publish-fish-document-summary-algorithm.sh --env-file .env.ocean-proof.local
```

Then copy the printed `FISH_OCEAN_ALGO_DID=did:op:...` into `.env.ocean-proof.local`.

`FISH_ALGORITHM_FILE_URL` must be public and immutable. Raw GitHub URLs must use a 40-character commit hash, not `main`, another branch, or a tag. The current Fish GitHub repository may be private, and Ocean nodes cannot fetch private GitHub raw URLs without credentials.

For the current Oncompute route, use:

```text
RPC=<Base mainnet RPC>
chain id 8453
gas token ETH on Base
paid compute token USDC on Base
```

For a free local Ocean Node demo, a supported testnet can be used instead if the Ocean contracts are deployed there and the proof wallet has gas on that chain. Fish's own Base Sepolia prototype contracts do not automatically make Ocean CLI asset publishing work on Base Sepolia.

5. Configure Fish:

```text
FISH_OCEAN_BATCH_ENDPOINT=<private adapter URL>
FISH_OCEAN_BATCH_PROVIDER_ID=<selected provider id>
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=<small test cap>
```

6. Create or use a Fish API key with credits.
7. Submit:

```bash
curl -fsS \
  -H "content-type: application/json" \
  -H "authorization: Bearer $FISH_API_KEY" \
  -X POST "$FISH_APP_URL/api/ocean/batch/jobs" \
  --data '{
    "taskType": "document_summary",
    "inputRef": "sha256:first-real-ocean-proof",
    "estimatedInputTokens": 1000,
    "maxOutputTokens": 512,
    "maxRuntimeSeconds": 600,
    "maxCostUsd": 1,
    "adapterMode": "ocean_http"
  }'
```

8. Verify:

```text
response ok true
receipt.sourceState is snapshot or live
receipt.adapterMode is ocean_http
receipt.providerJobId is the real Ocean job id
receipt.hashes.outputHash is present
usageReceipt.route is ocean-provider
/api/ocean/batch/jobs includes the receipt
/proof shows Docs batch evidence as non-sample
```

## Current Blocking Inputs

The scaffold can be tested without secrets, but the operator-owned private adapter environment still needs:

```text
fresh proof wallet private key or mnemonic stored only in the private adapter environment
Base mainnet RPC stored only in the private adapter environment
selected NODE_URL and FISH_OCEAN_COMPUTE_ENV_ID from the discovery script
published FISH_OCEAN_ALGO_DID from scripts/publish-fish-document-summary-algorithm.sh
```

If free compute works, no paid token is needed for the first proof. If free compute fails due to provider/payment rules, fund a fresh, dedicated proof wallet with only a small amount of Base ETH for gas and Base USDC for the selected paid environment. Treat that wallet as disposable, cap approvals/resources to the test budget, revoke allowances where practical, and rotate the wallet after the proof.

## What To Give Codex

Do not give Codex, chat tools, issue trackers, pull requests, or public logs any wallet private key, mnemonic, paid-resource credential, RPC credential, storage credential, provider secret, or signing material. Codex should only interact with Fish through the already-running private adapter URL and public-safe identifiers.

Minimum needed for Codex to verify the first proof through Fish:

```text
private adapter URL that already runs the Ocean job
FISH_OCEAN_BATCH_ENDPOINT
FISH_OCEAN_BATCH_PROVIDER_ID
public-safe provider id or label
algorithm DID
dataset DID(s), or confirmation to use []
compute environment id
non-secret budget cap to send in the Fish request
```

The adapter URL option is the required path for agent-assisted proof verification because Codex does not need custody of a wallet private key, mnemonic, payment resources, RPC credentials, or output storage credentials.

## Completion Definition

This proof is complete only when the current Fish app has current-state evidence for:

```text
one real Ocean / Oncompute job id
one Fish ocean_batch_job_receipt with non-sample sourceState
one outputRef or outputHash
one Fish usage receipt linked to the job
proof page showing the batch job as real evidence
```

Without those, the system is still only adapter-ready, not proven live.
