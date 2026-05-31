# Benchmark Matrix Plan

## Purpose

The Phase 3 benchmark matrix is the public-safe proof layer for selected Ocean providers. It records whether a selected provider can run small repeatable Fish workloads, how the latest run performed, and whether the underlying provider-job receipt can be verified.

The prototype is intentionally local-first. It uses JSON files under `data/proof/benchmark-runs/` and builds on the existing provider-job receipt flow, so every benchmark row can link back to signed proof without storing prompt or output text.

## Public-Safe Contract

- Benchmark definitions use stable `inputRef` hash references instead of prompts.
- Stored benchmark runs include usage, runtime, cost, status, provider public label, receipt id, and receipt signature status.
- Stored benchmark runs do not include prompt text, output text, user messages, API keys, provider contacts, endpoint URLs, payout preferences, or operator notes.
- Public reads are allowed through `GET /api/proof/benchmarks`.
- Mutations are admin-only through `POST /api/proof/benchmarks`.
- Invalid runtime JSON files are ignored instead of breaking the public report.

## Local Data Shape

Runtime files live in:

```text
data/proof/benchmark-runs/
```

Each run is a single JSON file with `benchmarkRunVersion: 1` and public visibility. It is derived from a provider-job receipt, so the receipt remains the source of truth for hashes and signatures.

Matrix rows are generated at request time from selected provider allowlist entries plus the recorded run files.

## Endpoint

```text
GET /api/proof/benchmarks
POST /api/proof/benchmarks
```

POST body:

```json
{
  "providerId": "prov_...",
  "benchmarkId": "tiny_smoke",
  "adapterMode": "mock_success"
}
```

`benchmarkId` can be:

```text
tiny_smoke
small_chat
summary_batch
```

`adapterMode` is only for the local prototype adapter and can be:

```text
mock_success
mock_failure
mock_timeout
```

## Definition Of Done

- `GET /api/proof/benchmarks` returns definitions, recent runs, matrix rows, public report rows, totals, and warnings.
- `POST /api/proof/benchmarks` requires admin auth in production-like environments.
- Benchmark runs are persisted under `data/proof/benchmark-runs/`.
- Stored benchmark files validate with zod before they are included in summaries.
- Public responses have `storesPromptOutputText: false` and do not expose prompt or output text.
- Docker creates the benchmark runtime directory and Compose persists `data/proof`.
