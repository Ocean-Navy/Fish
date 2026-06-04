# Fish Ocean Workload Product Strategy

## Thesis

Fish should sell useful open-source AI workloads as a simple product, while Ocean / Oncompute stays behind the counter as the compute supply.

Users should buy outcomes:

```text
summarize this
transcribe this
extract this
embed this
generate this
ask this model
```

Fish should handle:

```text
provider choice
job launch
warm routing
credits
cost caps
receipts
payout accounting
proof
fallback labels
```

The customer should not need to understand Ocean Nodes, compute environments, staking, runner sidecars, or provider allowlists to use the product.

## Current Technical Reality

Ocean / Oncompute is best treated as a cheap compute marketplace for containerized workloads. Fish can already read public Oncompute supply data through `https://api.oncompute.ai/nodes` and `https://api.oncompute.ai/envs`; those endpoints were live during the current review. The repo's `src/lib/oceanSupply.ts` already normalizes those sources into dashboard supply and provider rows.

Ocean Node / compute-to-data style execution is job-oriented. That is good for batch work and heavier workloads. It is not automatically a low-latency chat backend.

Warm Fish Runner plus vLLM is the right serving layer for interactive chat. The important question is where that runner lives. The best answer is:

```text
run Fish Runner + vLLM on cheap Ocean / Oncompute provider machines
then sell it through Fish as a simple API and meal counter
```

Do not route every chat message as a fresh Ocean compute job unless Oncompute exposes a proven long-running warm service pattern with stable networking, streaming, auth, and uptime.

## Product Shape

Use two lanes.

### Lane 1: Ocean Batch Workloads

Batch workloads are the best first Ocean-native product because they match job-based compute well.

Good first dishes:

| Dish | Open-source workload | Why it fits Ocean jobs |
| --- | --- | --- |
| Docs Bento | summarization / extraction model | bounded input, clear result, tolerant of seconds/minutes |
| Transcript Plate | Whisper / faster-whisper | easy user value, GPU useful, batch-friendly |
| OCR Catch | Tesseract / PaddleOCR / marker-style PDF pipeline | practical business need, can run async |
| Embed Bowl | sentence-transformers / BGE / E5 | repeatable, measurable, useful for builders |
| Code Net | containerized tests / static analysis | safe if sandboxed, valuable to builders |
| Image Stove | ComfyUI / Stable Diffusion batch | GPU-heavy, async output is acceptable |

Fish should expose these as simple menu items and API endpoints. Internally, each request becomes a workload job with:

```text
inputRef
workloadId
container image
resource request
max runtime
max cost
privacy mode
outputRef
receipt
```

The existing `docs/ocean-batch-jobs-plan.md` and `src/lib/oceanBatch.ts` are the correct starting point. They already model hash-only input references, budget checks, credit reserves, private adapter calls, public-safe receipts, and normal Fish usage receipts.

### Lane 2: Warm Ocean Runners

Warm workloads are for interactive product features:

```text
Ask
Code
Ocean helper
API chat
agent steps that need first-token latency
```

These should use:

```text
Fish Gateway
  -> selected provider Fish Runner
  -> vLLM / SGLang / TGI
  -> open-source model kept warm
```

Ocean / Oncompute still matters here, but as the provider host and pricing/supply layer, not as a new job per message. The runner must provide health, models, chat, and signed receipt metadata. The new `/api/ocean/provider-readiness` endpoint is the right gate before claiming a selected provider can serve user traffic.

## Workload Catalog Contract

Add a first-class workload catalog. Each workload should be a typed product definition, not an ad hoc endpoint.

Recommended shape:

```json
{
  "workloadId": "docs.summary.v1",
  "label": "Docs Bento",
  "lane": "batch",
  "containerImage": "registry.example/fish-docs-summary:1",
  "input": {
    "kind": "inputRef",
    "maxBytes": 5000000
  },
  "output": {
    "kind": "outputRef",
    "storesPublicText": false
  },
  "resources": {
    "gpu": "optional",
    "minVramGb": 0,
    "cpu": 2,
    "ramGb": 8
  },
  "limits": {
    "maxRuntimeSeconds": 600,
    "maxCostUsd": 1,
    "maxOutputTokens": 1024
  },
  "privacyMode": "hash_only_batch",
  "proof": {
    "requiresOutputHash": true,
    "requiresProviderReceipt": true
  }
}
```

This gives Fish one place to drive:

```text
UI menu
API docs
provider allowlists
benchmark matrix
pricing
proof
payouts
```

## Provider Model

Selected providers should be allowed per workload, not just globally.

Provider requirements:

```text
Ocean / Oncompute node visible in supply data
approved workload container
declared resource capacity
declared price basis
private job endpoint or Oncompute job adapter
no prompt/output logging policy for private workloads
support contact
payout route
benchmark pass
signed receipt support where possible
```

Provider allowlist entries should move toward:

```json
{
  "providerId": "prov_...",
  "allowedWorkloads": ["docs.summary.v1", "audio.transcribe.v1"],
  "allowedModels": ["fish-warm-chat"],
  "maxConcurrentJobs": 2,
  "maxDailySpendUsd": 25,
  "jobEndpoint": "private",
  "runnerEndpoint": "private",
  "pricing": {
    "gpuSecondUsd": 0.00002,
    "tokenUsd": 0.000001
  }
}
```

## Recommended MVP

### M1: Real Ocean Batch Workload

Connect one real Oncompute/Ocean job adapter to the existing batch contract.

Best first workload:

```text
Docs Bento: document_summary
```

Why:

```text
already represented in Fish
works with inputRef/outputRef
does not require streaming
easy to benchmark
easy to cap cost
useful for users and builders
```

Definition of done:

```text
Fish submits one real Oncompute/Ocean job
job uses an approved open-source container
Fish receives outputRef/outputHash
Fish records a non-sample batch receipt
Fish debits credits only on success
proof page shows real batch evidence
no raw prompt/document/output text is public
```

### M2: Workload Catalog

Add a `src/lib/workloadCatalog.ts` registry and a public endpoint:

```text
GET /api/workloads
POST /api/workloads/:workloadId/jobs
```

Keep the UI simple:

```text
Pick dish
Add input
See result
Credits spent
```

### M3: Warm vLLM on Ocean / Oncompute Supply

Deploy Fish Runner + vLLM on a selected cheap provider machine.

Definition of done:

```text
provider machine is selected from Oncompute/Ocean supply
Fish Runner answers /healthz and /models
vLLM answers a small chat request
/api/ocean/provider-readiness returns trafficReady=true
/v1/chat/completions routes through ocean-provider
usage receipt has selected provider id
runner receipt is signed and verified
```

### M4: Productize More Dishes

Add batch dishes in this order:

```text
Docs summary
Transcription
Embeddings
OCR / PDF extraction
Image batch
Code/test job
```

Do not expose a dish as live until it has a real adapter, budget guard, receipt, and proof label.

## Pricing And Business Logic

Fish should sell credits/subscriptions in front of compute.

Internal calculation:

```text
provider cost = Ocean / Oncompute job cost or runner token/gpu-second cost
user charge = provider cost + Fish margin
credits spent = normalized user charge
payout event = provider verified cost
```

For V1, keep it understandable:

```text
Users buy Fish credits.
Fish spends dollars / USDC on compute.
Providers get paid.
OCEAN holders get utility later through staking credits and provider bonds.
```

Avoid overcomplicating the first version with token mechanics. Tokenomics should support the loop, not block product launch.

## What Not To Do

Do not start by selling "compute marketplace access". That is not the product.

Do not make users pick providers, GPU types, nodes, or Docker images in the main UI.

Do not call local sample receipts Ocean-native proof.

Do not treat Ocean Node health as proof that a workload ran.

Do not force interactive chat through job-based execution unless latency is proven acceptable.

Do not build a generic platform before shipping one useful workload.

## Best Next Step

Build the first real Ocean workload adapter.

Target:

```text
Fish Docs Bento
  -> inputRef
  -> Oncompute/Ocean job
  -> approved open-source summarizer container
  -> outputRef/outputHash
  -> Fish batch receipt
  -> usage receipt
  -> proof page
```

In parallel, keep the warm vLLM Runner path for chat. But the first proof that Fish can turn cheap Ocean compute into a sellable product should be a real batch workload, not local vLLM and not a local Ocean Node smoke.

## Open Questions

1. Which Oncompute/Ocean job API should Fish use for the first adapter: public Ocean Node compute endpoints, Ocean CLI, Ocean Orchestrator, or a private provider job endpoint?
2. Where should input and output refs live for V1: S3/R2, IPFS, Arweave, Ocean asset references, or provider-owned storage?
3. Which first workload has the fastest path to a real result with low cost and low privacy risk?
4. What exact provider cost field should be treated as billable until Oncompute price basis is confirmed?
5. Does Oncompute support long-running warm services directly, or only job execution? This decides whether warm vLLM can be scheduled as an Oncompute workload or should remain a selected-provider runner deployment.
