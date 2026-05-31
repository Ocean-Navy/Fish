# Provider Pilot Plan

## Purpose

Phase 2 turns Fish from a visual product promise into a controlled Ocean provider pilot. The goal is to route small, real workloads to a selected provider allowlist, record what happened, and make the provider payout path auditable before any public scale-up.

This plan follows the deployable V0 site. It is scoped to product, data, and engineering readiness. It does not require homepage changes, token mechanics, or public claims about guaranteed provider earnings.

## Pilot Principles

- Start selected, not open. The first pilot should use 3-5 manually approved providers.
- Route batch workloads first. Streaming chat and warm inference belong to the later Fish Runner milestone in `docs/fish-runner-plan.md`.
- Prove every job with receipts. A useful receipt is better than a polished but unverifiable chart.
- Keep prompts private. Receipts may include hashes and usage numbers, but not prompt or output text.
- Account for payouts before automating settlement. Manual payout is acceptable if the ledger is complete.
- Keep source-state labels. Dashboard data must remain `live`, `snapshot`, `sample`, or `unavailable`.

## Milestone P2.0 - Provider Registry And Allowlist

### Outcome

Fish has a provider registry that separates provider applications from providers selected for routing.

### Deliverables

- Provider registry data model.
- Selected provider allowlist.
- Provider review checklist.
- Provider status lifecycle.
- Operator export for pilot outreach.

### Registry Fields

Provider profile:

```text
providerId
displayName
contact
sourceApplicationId
nodeEndpoint
nodeId
region
country
gpuTypes[]
capacitySummary
payoutPreference
operatorNotes
createdAt
updatedAt
```

Pilot status:

```text
applied | contacted | verified | allowed | probation | paused | rejected | exited
```

Allowlist entry:

```text
providerId
allowedWorkloadTypes[]
allowedModels[]
maxConcurrentJobs
maxDailySpendUsd
benchmarkRequired
operatorOwner
decisionReason
startsAt
expiresAt
```

### Implementation Notes

- The registry should ingest existing provider form submissions as the first source.
- Oncompute `/nodes` and `/envs` data can enrich node identity, region, GPU inventory, HTTP/P2P status, version, and eligibility.
- `pilotEligible` is a Fish decision. It must not be a direct copy of Ocean node eligibility.
- Public labels should use a friendly display name or shortened node id. Do not publish contact data, exact IPs, admin addresses, or private payout details.
- The allowlist should be checked before every provider-routed job, including benchmark jobs.

### Definition Of Done

- 3-5 provider profiles are reviewed and marked with an explicit pilot status.
- The router can determine whether a provider is allowed for a workload from the allowlist alone.
- Every allowlist decision has an operator owner and reason.
- Provider public labels are safe for a public dashboard.
- Pausing a provider prevents new routing without deleting historical records.

## Milestone P2.1 - Batch Inference Adapter

### Outcome

Fish can send a controlled batch job to a selected provider, receive a result, and write a receipt.

### Deliverables

- Provider job adapter interface.
- Batch job request/result schemas.
- Timeout and retry policy.
- Adapter-level logging policy.
- Fallback behavior when provider routing fails.

### Adapter Contract

Provider job request:

```json
{
  "jobId": "job_...",
  "idempotencyKey": "req_...:attempt_1",
  "providerId": "prov_...",
  "workloadType": "chat_batch",
  "model": "small-chat",
  "inputRef": "sha256:...",
  "parameters": {
    "maxOutputTokens": 512,
    "temperature": 0.2
  },
  "maxRuntimeSeconds": 600,
  "maxCostUsd": 1.0,
  "receiptPublicKey": "..."
}
```

Provider job result:

```json
{
  "jobId": "job_...",
  "providerJobId": "provider-local-id",
  "providerId": "prov_...",
  "status": "succeeded",
  "startedAt": "2026-06-01T00:00:00.000Z",
  "completedAt": "2026-06-01T00:01:12.000Z",
  "usage": {
    "inputTokens": 1200,
    "outputTokens": 340,
    "gpuSeconds": 44
  },
  "cost": {
    "amount": 0.12,
    "currency": "USDC",
    "pricingState": "verified"
  },
  "outputRef": "sha256:...",
  "errorCode": null
}
```

### Batch Workload Ladder

1. Smoke job: deterministic short prompt, tiny output, used only to test the provider path.
2. Benchmark job: fixed prompt set, fixed model class, measured for cost and reliability.
3. Pilot user job: real user/API workload routed only after smoke and benchmark pass.

### Failure Policy

- A failed smoke job keeps the provider out of the allowlist.
- A failed benchmark job marks the provider `probation` or `paused` depending on severity.
- A failed pilot user job should fall back to an external route when available.
- Any fallback must still write a Fish-side usage receipt with `backend: "fallback"`.

### Definition Of Done

- One selected provider can complete a smoke batch job through the adapter.
- Failed, timed-out, and cancelled jobs produce receipt records.
- The adapter never logs prompt text or full output text.
- The job lifecycle is visible in the proof dashboard plan.

## Milestone P2.2 - Signed Usage Receipts

### Outcome

Every routed job produces a canonical, verifiable record that can support dashboard proof, support reviews, and payout accounting.

### Receipt Types

```text
fish_request_receipt
provider_job_receipt
benchmark_receipt
payout_event_receipt
```

### Canonical Receipt Fields

```json
{
  "receiptVersion": 1,
  "receiptType": "provider_job_receipt",
  "receiptId": "rcpt_...",
  "jobId": "job_...",
  "requestId": "req_...",
  "providerId": "prov_...",
  "model": "small-chat",
  "workloadType": "chat_batch",
  "backend": "ocean_provider",
  "status": "succeeded",
  "createdAt": "2026-06-01T00:01:13.000Z",
  "startedAt": "2026-06-01T00:00:00.000Z",
  "completedAt": "2026-06-01T00:01:12.000Z",
  "usage": {
    "inputTokens": 1200,
    "outputTokens": 340,
    "gpuSeconds": 44
  },
  "cost": {
    "userChargeUsd": 0.2,
    "providerCostUsd": 0.12,
    "pricingState": "verified"
  },
  "hashes": {
    "inputHash": "sha256:...",
    "outputHash": "sha256:...",
    "canonicalReceiptHash": "sha256:..."
  },
  "signer": {
    "keyId": "fish-proof-key-1",
    "algorithm": "ed25519"
  },
  "signature": "base64..."
}
```

### Signing Rules

- Sign canonical JSON with stable key ordering.
- Do not include prompt text, output text, API keys, email addresses, or private provider notes.
- Store the full receipt internally.
- Publish only the public-safe subset and the canonical hash.
- Rotate signing keys by adding new `keyId` values; do not rewrite historical receipts.

### Definition Of Done

- Receipt hashes are deterministic across repeated canonicalization.
- A verification tool can confirm signature validity for a stored receipt.
- Public receipt views exclude private data by default.
- Failed and fallback jobs have receipts too.

## Milestone P2.3 - Payout Accounting

### Outcome

Fish can calculate what selected providers are owed and explain why.

### Deliverables

- Provider payable event model.
- Payout batch model.
- Manual settlement workflow.
- Dispute and adjustment states.
- CSV export for operator review.

### Ledger Events

```text
job_accrued
benchmark_stipend
manual_adjustment
refund
payout_approved
payout_paid
payout_voided
```

Payout event fields:

```text
payoutEventId
providerId
sourceReceiptId
eventType
amount
currency
amountUsd
state
operatorOwner
reason
createdAt
approvedAt
paidAt
transactionRef
```

Payout states:

```text
accrued | review | approved | paid | disputed | voided
```

### Definition Of Done

- Every payable event links back to a signed receipt or explicit manual adjustment.
- A payout batch can be exported and reviewed before payment.
- Paid events store a transaction reference or manual settlement note.
- Disputed events are excluded from payable totals until resolved.
- Dashboard totals can split accrued, approved, paid, disputed, and voided amounts.

## Milestone P2.4 - Benchmark Matrix

### Outcome

Fish can compare selected providers on reliability, throughput, queue time, and cost before routing real user jobs.

### Matrix Dimensions

```text
providerId
gpuType
region
modelClass
workloadType
inputSizeBucket
outputSizeBucket
batchSize
runtimeAdapter
```

### Required Metrics

```text
successRate
medianQueueSeconds
medianRuntimeSeconds
tokensPerSecond
gpuSeconds
providerCostUsd
costPer1kTokensUsd
receiptSignatureStatus
lastRunAt
sampleSize
```

### First Benchmark Set

- Tiny smoke prompt for adapter correctness.
- Small chat completion batch for common API usage.
- Longer summarization batch for context-heavy usage.
- Embedding-style workload only after the adapter supports it.

### Definition Of Done

- Each allowed provider has at least one successful smoke result.
- Each routeable model/provider pair has a benchmark row or is marked untested.
- Benchmark failures are visible in provider scorecards.
- Benchmarks are reproducible from versioned workload definitions.

## Milestone P2.5 - Provider Scorecard

### Outcome

Fish can explain why a provider is allowed, paused, or preferred for routing.

### Score Inputs

Reliability:

```text
job success rate
timeout rate
failed receipt rate
recent uptime
```

Performance:

```text
median queue time
median runtime
tokens per second
benchmark pass rate
```

Cost:

```text
verified provider cost
cost per workload
pricing confidence
```

Operations:

```text
provider responsiveness
stable endpoint
valid payout details
incident history
```

### Scorecard States

```text
new | eligible | allowed | preferred | probation | paused | exited
```

### Definition Of Done

- Every selected provider has a scorecard row.
- Scorecard state is derived from documented inputs plus an operator decision.
- The dashboard can show score inputs without exposing private notes.
- Provider status changes are auditable.

## Suggested Parallel Work Packages

These can run in separate worktrees after this spec is committed:

1. Registry and allowlist: data model, admin import/export, provider status lifecycle.
2. Batch adapter: adapter interface, smoke job path, timeout/fallback handling.
3. Receipts and accounting: canonical receipt signing, payout events, payout batch export.
4. Benchmarks and scorecards: workload definitions, benchmark runner, score formulas.

## Pilot Exit Criteria

The Phase 2 provider pilot is complete when:

- 3-5 providers are selected and allowed for at least one workload type.
- Each selected provider has smoke and benchmark receipts.
- At least one real Fish workload is routed to an Ocean provider.
- Provider payable events are recorded and reviewable.
- The proof dashboard can show jobs, receipts, payouts, benchmarks, and scorecards with correct source-state labels.

## Open Questions

- Which provider payout currency is acceptable for the first manual settlement batch?
- Which model classes are approved for the first benchmark set?
- Do providers need to sign receipts themselves in Phase 2, or is Fish-side signing enough until a provider runner exists?
- What public provider naming policy is acceptable for the first dashboard?
- Who owns final provider allowlist decisions during the pilot?
