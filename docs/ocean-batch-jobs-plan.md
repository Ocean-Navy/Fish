# Ocean Batch Jobs

## Purpose

The first Ocean batch path gives the Docs dish a clean backend contract without pretending that live Ocean batch execution is already configured.

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

`inputRef` is a hash or storage reference. Do not send raw document text to this endpoint.

Fish checks `maxCostUsd` against the remaining `FISH_OCEAN_BATCH_DAILY_BUDGET_USD` before calling a private adapter. The default daily cap is `$30`.

`/v1/chat/completions` with `model: "fish-docs"` generates a hash-only `inputRef`, uses this batch contract, and returns an OpenAI-style chat response with batch receipt metadata. The generated batch request is capped by `FISH_DOCS_BATCH_MAX_RUNTIME_SECONDS` and `FISH_DOCS_BATCH_MAX_COST_USD`.

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
- No raw document text.
- No full output text in public receipts.
- No provider endpoint URLs or API keys in public responses.
- Batch receipts live under ignored `data/ocean-batch/`.

## Current Limit

This is not live Ocean execution by itself. It is the product/API contract needed before connecting a real Oncompute/Ocean batch job runner.
