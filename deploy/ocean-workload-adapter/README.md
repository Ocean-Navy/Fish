# Ocean Workload Adapter

This is the private service that sits behind `FISH_OCEAN_BATCH_ENDPOINT`.

It must not be exposed as a public API. It holds the Ocean proof wallet in its
environment and shells out to the official Ocean CLI checkout to start one real
Ocean / Oncompute compute job.

## Why This Exists

Fish already has the public receipt path:

```text
POST /api/ocean/batch/jobs
  -> FISH_OCEAN_BATCH_ENDPOINT
  -> ocean_batch_job_receipt
  -> /proof
```

This adapter supplies the missing private part:

```text
Fish API
  -> private adapter /jobs
  -> Ocean CLI
  -> Ocean / Oncompute compute environment
  -> downloaded job result
  -> sha256 outputRef
```

Dry-run mode never returns `status: "succeeded"`. Live mode only returns
success after the Ocean CLI starts a job and `downloadJobResults` writes a
non-empty result directory that can be hashed. `/jobs` and `/config` require
`Authorization: Bearer <OCEAN_WORKLOAD_ADAPTER_API_KEY>`; live readiness fails
unless that key is a non-placeholder secret with at least 32 characters.

## Setup

Copy the template to a private env file:

```bash
cp deploy/ocean-workload-adapter/env.example .env.ocean-proof.local
```

Fill in:

```text
OCEAN_WORKLOAD_ADAPTER_API_KEY (unique secret, at least 32 characters)
PRIVATE_KEY or MNEMONIC
RPC
NODE_URL
FISH_OCEAN_DATASET_DIDS
FISH_OCEAN_ALGO_DID
FISH_OCEAN_COMPUTE_ENV_ID
OCEAN_CLI_DIR
```

Prepare the Ocean CLI checkout with:

```bash
scripts/bootstrap-ocean-cli.sh
```

That prints the path to use:

```text
OCEAN_CLI_DIR=/Users/robin/Projects/opfish/.deps/ocean-cli
```

For the first proof, use a fresh wallet and a Base mainnet RPC:

```text
Chain: Base mainnet
Chain id: 8453
Gas token: ETH on Base
Paid compute token: Base USDC
```

Leave `FISH_OCEAN_PAYMENT_TOKEN` and `FISH_OCEAN_RESOURCES` empty when using
`startFreeCompute`.

## Discover Candidate Environments

```bash
node scripts/discover-oncompute-envs.mjs --chain 8453 --free --limit 10
```

Copy:

```text
nodeUrl -> NODE_URL
envId   -> FISH_OCEAN_COMPUTE_ENV_ID
```

The algorithm DID still has to come from an operator-created or selected Ocean
algorithm asset. For a first self-contained proof, `FISH_OCEAN_DATASET_DIDS=[]`
is acceptable if the chosen algorithm supports it.

Fish includes a first algorithm bundle at:

```text
deploy/ocean-workload-adapter/algorithms/fish-document-summary/
```

After the proof wallet, RPC, and `NODE_URL` are set, publish it with:

```bash
export FISH_ALGORITHM_FILE_URL="https://public-url.example/fish-document-summary/algorithm.py"
scripts/publish-fish-document-summary-algorithm.sh --env-file .env.ocean-proof.local
```

The script prints the `FISH_OCEAN_ALGO_DID` value for `.env.ocean-proof.local`.

`FISH_ALGORITHM_FILE_URL` must be public. The current GitHub repository is private, so an unauthenticated Ocean node cannot fetch a private `raw.githubusercontent.com` URL.

## Run Locally

Dry-run, no wallet secrets:

```bash
export OCEAN_WORKLOAD_ADAPTER_API_KEY="$(openssl rand -hex 32)"
node deploy/ocean-workload-adapter/server.mjs &
adapter_pid=$!
scripts/smoke-ocean-workload-adapter.sh
kill "$adapter_pid"
```

Live:

```bash
OCEAN_WORKLOAD_ADAPTER_MODE=live \
node deploy/ocean-workload-adapter/server.mjs --env-file .env.ocean-proof.local
```

Then point Fish at it:

```text
FISH_OCEAN_BATCH_ENDPOINT=http://127.0.0.1:8787/jobs
FISH_OCEAN_BATCH_API_KEY=<same value as OCEAN_WORKLOAD_ADAPTER_API_KEY>
FISH_OCEAN_BATCH_PROVIDER_ID=<selected provider label>
```

Submit a Fish batch job with:

```json
{
  "taskType": "document_summary",
  "inputRef": "sha256:first-real-ocean-proof",
  "estimatedInputTokens": 1000,
  "maxOutputTokens": 512,
  "maxRuntimeSeconds": 600,
  "maxCostUsd": 1,
  "adapterMode": "ocean_http"
}
```

## Contract

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

The adapter returns successful proof only in this shape:

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
    "amount": 0,
    "currency": "USDC"
  },
  "outputRef": "sha256:..."
}
```

Fish rejects successful adapter responses if `outputRef` is missing, output
tokens exceed the cap, or provider cost exceeds `maxCostUsd`.

## CLI Drift

Ocean CLI command names are configurable in `env.example`:

```text
FISH_OCEAN_START_FREE_COMMAND=startFreeCompute
FISH_OCEAN_START_PAID_COMMAND=startCompute
FISH_OCEAN_DOWNLOAD_COMMAND=downloadJobResults
FISH_OCEAN_DOWNLOAD_ARGS_TEMPLATE={jobId} {index} {outputDir}
```

Keep these as defaults unless the current Ocean CLI checkout requires different
command names or positional arguments.
