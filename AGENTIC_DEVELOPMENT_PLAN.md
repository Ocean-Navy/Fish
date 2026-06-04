# Agentic Development Plan

This file is the task-routing guide for coding agents contributing to Fish. For repo-wide operating rules, always start with `AGENTS.md`.

## Agent Context Pack

Every coding agent should receive or read:

1. `AGENTS.md`
2. `README.md`
3. `PRODUCT_SPEC.md`
4. `TECHNICAL_ARCHITECTURE.md`
5. the relevant source files for the task
6. the relevant feature doc under `docs/`
7. `api/openapi.yaml` for backend or public API work

Agents should not invent new product strategy. Implement the current contract and return open questions as explicit TODOs or PR notes.

## Current Codebase Status

Fish is no longer only an early landing-page sprint. The repository now includes:

- Next.js App Router public pages and API routes.
- Ocean supply dashboard endpoints with sample fallback.
- Public proof dashboard endpoints for receipts, providers, benchmarks, market-making, and payouts.
- Prototype `/v1` Fish API routes for models, API keys, chat completions, balance, and usage.
- Local JSON ledgers for submissions, credits, usage receipts, provider proof, batch jobs, and staking credits.
- Docker, nginx, systemd, and warm-inference deployment examples.

Agents should treat the existing TypeScript implementation as the baseline and keep roadmap docs aligned when behavior changes.

## Contribution Lanes

### Lane 1: Public Product And UI

Primary files:

- `app/page.tsx`
- `app/*/page.tsx`
- `src/components/*`
- `app/globals.css`
- `DESIGN.md`
- `WEBSITE_SPEC.md`
- `CONTENT_COPY.md`

Typical tasks:

- Improve responsive layout and accessibility.
- Add or polish loading, empty, and error states.
- Keep public copy simple, visual, and honest about live versus planned proof.
- Keep generated assets text-free and render copy in HTML.

Acceptance:

- Mobile and desktop render correctly.
- Copy keeps Fish community-built and not-official positioning.
- Sample, mock, and live states remain visibly distinct.
- `npm run verify` passes.

### Lane 2: Ocean Supply Dashboard

Primary files:

- `app/api/ocean/*/route.ts`
- `src/lib/oceanSupply.ts`
- `src/components/DashboardPreview.tsx`
- `DASHBOARD_SPEC.md`
- `docs/oncompute-ocean-data-sources.md`

Typical tasks:

- Improve ingestion resilience.
- Normalize new Oncompute/Ocean fields.
- Add dashboard table or KPI fields.
- Clarify source warnings.

Acceptance:

- `/api/ocean/summary` and `/api/ocean/resources` preserve source-state labels.
- Live data is not merged into sample totals.
- Endpoint shape updates are reflected in `api/openapi.yaml`.
- `npm run verify` passes and the changed endpoint is smoke-tested.

### Lane 3: Prototype Fish API And Billing

Primary files:

- `app/v1/*/route.ts`
- `app/api/billing/*/route.ts`
- `src/lib/fishLedger.ts`
- `src/lib/fishChatGateway.ts`
- `src/lib/fishFeaturePolicy.ts`
- `docs/billing-topups-plan.md`

Typical tasks:

- Improve API compatibility.
- Harden credit reservation and release behavior.
- Improve model or plan metadata.
- Add aggregate billing views without exposing private rows.

Acceptance:

- API keys remain hashed.
- Receipts store usage, hashes, route metadata, and cost estimates, not raw prompt/output text.
- Model validation happens before quota reservation and backend calls.
- `api/openapi.yaml` stays synchronized.

### Lane 4: Routing, Warm Inference, And Fish Runner

Primary files:

- `src/lib/fishRouter.ts`
- `src/lib/routePolicy.ts`
- `src/lib/vllmChat.ts`
- `src/lib/openAiCompatibleChat.ts`
- `deploy/warm-inference/*`
- `docs/warm-inference-runbook.md`
- `docs/fish-runner-plan.md`

Typical tasks:

- Harden route readiness checks.
- Improve public route compass labels.
- Add private runner integration details.
- Keep external fallback visible and capped.

Acceptance:

- `/api/routing/policy` and `/api/warm/status` expose no secrets.
- Warm Ocean claims are backed by configured private route readiness.
- External fallback budget and privacy labels remain explicit.
- `npm run verify` passes and route status endpoints are smoke-tested.

### Lane 5: Provider Pilot And Proof

Primary files:

- `app/api/providers/*/route.ts`
- `app/api/proof/*/route.ts`
- `src/lib/providerPilot.ts`
- `src/lib/providerJobs.ts`
- `src/lib/providerPayouts.ts`
- `src/lib/providerScorecard.ts`
- `src/lib/providerBenchmarks.ts`
- `docs/provider-pilot-plan.md`
- `docs/benchmark-matrix-plan.md`
- `docs/market-making-report.md`

Typical tasks:

- Improve selected-provider allowlist behavior.
- Add proof filters or public-safe summaries.
- Harden provider payout accounting.
- Improve benchmark and scorecard reporting.

Acceptance:

- Public endpoints hide contacts, endpoint URLs, payout preferences, operator notes, and transaction references.
- Mock/sample provider receipts do not imply real provider work.
- Non-sample selected-provider receipts keep hashes and signatures.
- Public proof changes update `api/openapi.yaml`.

### Lane 6: Ocean Batch Jobs

Primary files:

- `app/api/ocean/batch/jobs/route.ts`
- `src/lib/oceanBatch.ts`
- `docs/ocean-batch-jobs-plan.md`

Typical tasks:

- Harden hash-only batch job requests.
- Improve adapter budget checks.
- Improve receipt linkage to Fish usage.

Acceptance:

- `POST /api/ocean/batch/jobs` never accepts raw document text.
- `adapterMode: "sample_success"` remains clearly sample.
- `adapterMode: "ocean_http"` is used only with a configured private adapter.
- Public receipts expose hashes and states, not raw content.

### Lane 7: OCEAN Utility Prototypes

Primary files:

- `app/api/staking/*/route.ts`
- `src/lib/stakingCredits.ts`
- `docs/ocean-staking-credits-plan.md`
- `docs/provider-bonds-plan.md`
- `docs/tokenized-credits-plan.md`

Typical tasks:

- Improve offchain staking-credit accounting.
- Add public-safe utility summaries.
- Prepare future onchain contract requirements.

Acceptance:

- No guaranteed yield language.
- Credits are bounded by configured budgets.
- Wallet references and operator notes stay private.
- Docs clearly distinguish prototype/offchain behavior from future contracts.

### Lane 8: Deployment And Operations

Primary files:

- `Dockerfile`
- `docker-compose.yml`
- `deploy/*`
- `Makefile`
- `.env.example`
- `.env.production.example`
- `docs/deployment.md`

Typical tasks:

- Harden Docker or preview deployment.
- Improve health checks and operator commands.
- Add missing environment variables to examples and docs.

Acceptance:

- `npm run verify` and `docker build -t opfish-web:latest .` pass when the task affects deployment.
- `FISH_ADMIN_TOKEN` is required for production admin actions.
- Runtime data volumes and backup requirements stay documented.

## Agent Handoff Format

End every substantial task with:

```text
Changed:
- ...

Validation:
- ...

Docs updated:
- ...

Open questions:
- ...
```

For incomplete work, include exact files, commands run, observed errors, and the next smallest safe step.
