# Market-Making Report

## Purpose

The Phase 3 market-making report turns Fish proof data into routing and pricing decisions. It is not a billing ledger and it is not a token promise. It answers one practical operator question:

```text
Which provider boats can receive controlled Fish traffic, and what price band is honest enough to test?
```

## Public-Safe Inputs

The report uses only public-safe summaries:

- Ocean supply summary from `/api/ocean/summary`;
- Fish usage summary from local usage receipts;
- provider scorecards from `/api/proof/providers`;
- benchmark matrix rows from `/api/proof/benchmarks`.

It does not read or expose prompt text, output text, API keys, provider contacts, endpoint URLs, private payout preferences, operator owners, operator notes, or transaction references.

## Endpoint

```text
GET /api/proof/market-making
```

The response includes:

- `routeRules`: plain rules for when Fish can route traffic;
- `routes`: provider route candidates with lane state and reason;
- `costModels`: cost and suggested user price per 1k tokens by benchmark;
- `demand`: Fish request and credit-spend counters;
- `supply`: Ocean provider/GPU summary;
- `warnings`: reasons to keep traffic in pilot mode.

## Route Lanes

```text
route_now        controlled user traffic can start
pilot_only       operator-routed jobs only
benchmark_first  selected provider needs benchmark evidence
watch            provider is visible but not selected
pause            operator review required before traffic
```

## Pricing Policy

The prototype price model is intentionally conservative:

- use median successful benchmark provider cost per 1k tokens;
- apply a target gross margin buffer;
- reserve a small per-1k contribution for staking credits or operations;
- keep confidence labels visible;
- hide or mark low-confidence prices when evidence is sparse.

## Definition Of Done

- `GET /api/proof/market-making` returns public-safe route rules, routes, cost models, demand, supply, totals, and warnings.
- Dashboard shows a compact market-making panel without private operator data.
- Benchmark costs and provider scorecards drive route decisions.
- No prompt/output text is accepted, stored, or exposed.
- The report can be generated from local JSON proof data and sample/live Ocean supply.
