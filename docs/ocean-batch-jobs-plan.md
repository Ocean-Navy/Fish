# Ocean Batch Jobs

## Purpose

The first Ocean batch path gives Fish dishes a clean backend contract without pretending that live Ocean batch execution is already configured.

Fish accepts a hash or storage reference, reserves Fish Credits, runs a sample or private batch adapter, writes a public-safe batch receipt, and then writes a normal Fish usage receipt for successful jobs.

## Endpoint

```text
GET /api/ocean/batch/jobs
POST /api/ocean/batch/jobs
```

`POST` requires a Fish API key.

Request shape:

```json
{
  "taskType": "document_summary",
  "inputRef": "sha256:example-document-ref",
  "estimatedInputTokens": 1200,
  "maxOutputTokens": 512,
  "maxRuntimeSeconds": 600,
  "maxCostUsd": 1,
  "adapterMode": "sample_success"
}
```

`inputRef` is a hash or storage reference. Do not send raw document text, repo text, datasets, or output text to this endpoint.

Fish checks `maxCostUsd` against the remaining `FISH_OCEAN_BATCH_DAILY_BUDGET_USD` before calling a private adapter. The default daily cap is `$30`.

`/v1/chat/completions` and `/api/dishes/:dishId/run` generate a hash-only `inputRef`, use this batch contract, and return an OpenAI-style response with batch receipt metadata for Ocean batch dishes.

Current dish mapping:

| Dish | Model alias | Task type | Default cap |
| --- | --- | --- | --- |
| Docs Bento | `fish-docs` | `document_summary` | 600 seconds / $1.00 |
| Repo Roll | `fish-repo` | `structured_extraction` | 900 seconds / $1.50 |
| Eval Platter | `fish-eval` | `batch_chat` | 1200 seconds / $2.00 |
| Data Sushi | `fish-data` | `embeddings` | 900 seconds / $1.25 |

Per-dish overrides use `FISH_<DISH>_BATCH_MAX_RUNTIME_SECONDS` and `FISH_<DISH>_BATCH_MAX_COST_USD`, where `<DISH>` is `DOCS`, `REPO`, `EVAL`, or `DATA`.

## Adapter Modes

```text
sample_success
sample_failure
ocean_http
```

Sample modes are local proof only and write `sourceState: "sample"`.

`ocean_http` posts to `FISH_OCEAN_BATCH_ENDPOINT` and writes `sourceState: "snapshot"` until a stronger Ocean-native receipt/proof path exists.

The private adapter scaffold lives at:

```text
deploy/ocean-workload-adapter/
```

It defaults to dry-run mode, which returns a failed adapter result and cannot create a successful proof receipt. Live mode requires a proof wallet, Base RPC, selected `NODE_URL`, selected compute environment id, and an algorithm DID.

For testnet demos, the Ocean CLI chain must have Ocean contract addresses. The bundled Ocean CLI 2.0.0 address file includes Base mainnet (`8453`) but not Base Sepolia (`84532`); Base Sepolia needs a custom `ADDRESS_FILE` before the Fish algorithm can be published there.

For local stack validation before a GPU VM, the private adapter can run in `local_ocean_node` mode. That mode bypasses Ocean CLI asset publishing and submits a signed raw-code `/freeCompute` job to our own Ocean Node. It still creates a real Ocean C2D Docker job and returns an output tar hash, but it should be described as local Ocean Node proof, not paid Oncompute demand or GPU-backed inference.

The first prepared algorithm bundle is:

```text
deploy/ocean-workload-adapter/algorithms/fish-document-summary/
```

Publish it with `scripts/publish-fish-document-summary-algorithm.sh` after `scripts/bootstrap-ocean-cli.sh` prepares the local Ocean CLI checkout.

## Private Adapter Response

The private adapter should return:

```json
{
  "jobId": "batch_job_...",
  "providerJobId": "provider-job-123",
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

Fish rejects successful adapter responses that exceed `maxCostUsd`, exceed token caps, or do not include an `outputRef`/`outputHash`.

## Privacy Rules

- No raw prompt text.
- No raw dish input text.
- No full output text in public receipts.
- No provider endpoint URLs or API keys in public responses.
- Batch receipts live under ignored `data/ocean-batch/`.

## Current Limit

This is not live Ocean execution by itself. It is the product/API contract needed before connecting a real Oncompute/Ocean batch job runner.

## Public Testnet Demo Stack

For the first public testnet demo, Fish can avoid paid third-party Oncompute jobs by running its own Ocean Node on the GPU VM:

```text
Fish web VM
  -> FISH_OCEAN_BATCH_ENDPOINT
  -> private Ocean workload adapter
  -> Ocean CLI
  -> Ocean Node on the GPU VM
  -> free test compute environment
  -> outputRef / outputHash
```

Use:

```text
deploy/ocean-demo-stack/docker-compose.yml
deploy/ocean-demo-stack/env.example
scripts/generate-ocean-node-compute-env.mjs
scripts/smoke-ocean-demo-stack.sh
```

This can prove that Fish dishes run through an Ocean Node operated by Ocean Navy. It should not be described as paid third-party Oncompute demand. Keep `sourceState` labels conservative until receipt verification and proof evidence are strong enough to upgrade the label.
