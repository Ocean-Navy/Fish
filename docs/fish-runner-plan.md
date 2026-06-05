# Fish Runner Plan

## Purpose

Phase 5 moves Fish from batch-style provider jobs toward a low-latency AI product that can feel closer to Venice while still using selected Ocean providers. The `fish-runner` is the provider-side service that keeps models warm, serves streamed inference, reports health, and signs public-safe usage proof.

This is a planning contract only. It should not replace the current prototype API, selected-provider allowlist, benchmark matrix, payout ledger, or proof dashboard.

## Principles

- Start with selected providers only. The runner is not an open network entrypoint.
- Keep the OpenAI-compatible Fish API as the user-facing surface.
- Keep prompts and outputs out of public proof, exports, and dashboard rows.
- Do not claim Ocean-native chat until a selected Ocean provider actually serves the request.
- Prefer boring health checks and failover over clever routing.
- Require provider-side signed receipts before using runner traffic for scorecards or payouts.
- Match privacy claims to the active route and the staged ladder in `docs/privacy-modes-plan.md`.

## System Boundary

```text
User app / SDK
  -> Fish API gateway
  -> Fish router
  -> selected provider fish-runner
  -> vLLM / SGLang / TGI / compatible engine
  -> runner receipt
  -> Fish proof + payout ledgers
```

Fish owns:

- API-key auth and user credit debits;
- selected-provider allowlist checks;
- route selection, budgets, retries, and fallback;
- Fish-side receipt canonicalization;
- public proof and payout summaries.

Providers own:

- runner deployment and engine runtime;
- model loading and warm pools;
- provider telemetry and uptime;
- provider-side receipt signing key;
- truthful usage, timing, and error reports.

## Milestone R5.0 - Runner Contract

### Outcome

Fish and selected providers have one documented contract for health checks, model inventory, streamed inference, and receipts.

### Required Endpoints

```text
GET /healthz
GET /models
POST /v1/chat/completions
POST /receipts/sign
```

`GET /healthz` returns runner identity, engine status, warm model state, queue depth, and current capacity.

`GET /models` returns public model ids, context limits, pricing basis, supported features, and whether the model is warm.

`POST /v1/chat/completions` accepts an OpenAI-compatible request subset plus Fish routing metadata. Streaming should use SSE-compatible chunks.

`POST /receipts/sign` is not a generic signing oracle. If signing is not bundled into the inference response, it must only sign or re-sign a public-safe usage record that the runner already produced for a known `jobId` or `idempotencyKey`, and it must reject caller-supplied receipt bodies that do not match runner-owned state.

### Definition Of Done

- Contract examples exist for health, models, streaming, and receipt signing.
- The contract distinguishes transport payloads from stored public proof.
- Every request has an idempotency key, route id, provider id, and max budget.
- The runner can say "not ready" without being treated as malicious.

## Milestone R5.1 - Warm Model Runtime

### Outcome

One selected provider can keep at least one model warm and report readiness before receiving user traffic.

### Engine Targets

Initial adapters should target one of:

```text
vLLM
SGLang
TGI
OpenAI-compatible local engine
```

The runner should hide engine-specific details behind a small adapter interface:

```text
listModels()
warmModel(model)
streamChat(request)
cancel(jobId)
collectUsage(jobId)
```

### Definition Of Done

- The runner can start with a static model config.
- Health output shows `cold`, `warming`, `warm`, `degraded`, or `offline`.
- A smoke prompt can stream tokens from a warm model.
- The runner can reject traffic when queue depth or memory pressure is too high.

## Milestone R5.2 - Streaming Through Fish

### Outcome

The Fish API gateway can stream a chat response from one selected runner while keeping the existing credit and receipt model intact.

### Routing Rules

- Check user API key and credit budget before opening the runner stream.
- Check selected-provider allowlist and model eligibility before routing.
- Attach a route id and idempotency key to the runner request.
- Track first-token latency, total duration, token usage, and completion status.
- If the runner fails before first token, fallback may be used when configured.
- If the runner fails mid-stream, return a clear terminal error and write a failed receipt.

### Definition Of Done

- One selected provider can serve a streamed chat request through Fish.
- The user receives OpenAI-compatible streaming chunks.
- Fish records a usage receipt for success, timeout, cancellation, and fallback.
- No prompt or output text is written to public proof files.

## Milestone R5.3 - Provider Signed Receipts

### Outcome

Runner traffic has provider-side proof, not only Fish-side proof.

### Provider Receipt Shape

```json
{
  "runnerReceiptVersion": 1,
  "jobId": "job_...",
  "routeId": "route_...",
  "providerId": "prov_...",
  "runnerId": "runner_...",
  "model": "small-chat",
  "engine": "vllm",
  "status": "succeeded",
  "startedAt": "2026-06-01T00:00:00.000Z",
  "completedAt": "2026-06-01T00:00:08.000Z",
  "usage": {
    "inputTokens": 1200,
    "outputTokens": 240,
    "gpuSeconds": 8
  },
  "timing": {
    "firstTokenMs": 620,
    "totalMs": 8200
  },
  "hashes": {
    "requestHash": "sha256:...",
    "outputHash": "sha256:...",
    "canonicalReceiptHash": "sha256:..."
  },
  "signer": {
    "keyId": "provider-runner-ed25519-...",
    "algorithm": "ed25519"
  },
  "signature": "base64..."
}
```

### Signing Rules

- Sign canonical JSON with stable key ordering.
- Hash request and output payloads, but do not store raw text in public proof.
- Include failure and cancellation receipts.
- Rotate provider signing keys by publishing new `keyId` values.
- Fish should verify provider signatures before using receipts for scorecards or payouts.

### Definition Of Done

- Fish can verify a provider runner receipt.
- Receipt verification failure excludes the job from payout automation.
- Public proof can show the runner receipt hash and signature state.
- Provider receipt fields map cleanly into existing proof summaries.

## Milestone R5.4 - Health Checks And Failover

### Outcome

Fish can route around a bad runner without confusing users or overstating proof.

### Health Signals

```text
runner online/offline
model warm state
queue depth
estimated wait
last smoke result
last benchmark result
first-token latency p50/p95
completion success rate
receipt signature success rate
```

### Failover Policy

- Prefer the selected warm provider with the best recent health for the requested model.
- Use another selected provider only if it is eligible for that model and workload.
- Use external fallback only when configured and clearly marked as fallback proof.
- Do not retry non-idempotent requests without an idempotency key.
- Never charge a user twice for one routed request.

### Definition Of Done

- The router can mark a runner `healthy`, `degraded`, or `offline`.
- Health state is visible in an operator view before public claims are made.
- Fallback and failover receipts are distinct in proof data.
- A provider can be paused without deleting historical runner receipts.

## Milestone R5.5 - Operator Runbook

### Outcome

The team can onboard and operate a selected runner without ad hoc instructions.

### Runbook Contents

- provider prerequisites;
- deployment environment variables;
- model config example;
- signing-key setup and rotation;
- smoke-test command;
- rollback command;
- incident checklist;
- privacy checklist;
- payout/proof review checklist.

### Definition Of Done

- A provider can deploy the runner from the runbook.
- Fish can run a smoke test and see a signed runner receipt.
- Operators know when to pause a runner.
- Operators know which data is safe to publish.

## Out Of Scope For Phase 5

- Open provider admission.
- Provider OCEAN bonds.
- Slashing.
- Tokenized credits.
- Autonomous settlement.
- Public claims that all Fish chat is Ocean-native.

## Open Questions

- Should provider signing keys be self-managed first, or registered through a Fish operator allowlist?
- Which first engine should be supported: vLLM, SGLang, TGI, or an OpenAI-compatible local wrapper?
- Should provider receipts be signed inline at stream completion or through a separate `/receipts/sign` call?
- What minimum latency target is good enough for the first public Ocean-native chat claim?
- How much provider telemetry should be public versus operator-only?
