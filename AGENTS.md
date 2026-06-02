# Agent Instructions For Fish

Fish is the Ocean Navy product layer for turning Ocean Network / Oncompute supply into simple AI access. It is community-built on Ocean Protocol infrastructure. Do not describe it as an official Ocean Protocol product unless a maintainer explicitly changes that positioning.

These instructions apply to the whole repository.

## First Files To Read

Start with these files before changing code:

1. `README.md` for setup, routes, configuration, deployment, and current feature status.
2. `PRODUCT_SPEC.md` for product principles, audiences, scope, non-goals, and value loops.
3. `TECHNICAL_ARCHITECTURE.md` for component boundaries and storage assumptions.
4. `api/openapi.yaml` for public and prototype API contracts.
5. `DESIGN.md`, `WEBSITE_SPEC.md`, `DASHBOARD_SPEC.md`, and `CONTENT_COPY.md` for UI, copy, and dashboard work.
6. The relevant `docs/*.md` plan for the feature area you are touching.

If these files conflict, follow the most specific current implementation contract in this order:

1. Existing TypeScript code and route behavior.
2. `api/openapi.yaml` for API shape.
3. `README.md` for operator-visible behavior.
4. Feature plan docs under `docs/`.
5. Older roadmap/spec docs.

Update the docs when your change makes them stale.

## Local Setup

Use Node.js 22.

```bash
nvm use
npm ci
npm run dev
```

Default local URL:

```text
http://127.0.0.1:3000
```

Useful validation commands:

```bash
npm run lint
npm run typecheck
npm run build
npm run verify
```

`npm run verify` is the default pre-PR check. For route or UI changes, also smoke the affected pages or endpoints locally.

## Repository Map

```text
app/                         Next.js App Router pages and API routes
app/v1/                      Prototype Fish API routes
src/components/              UI components for landing, dashboard, proof, account, and chat
src/lib/                     Data ingestion, route policy, ledgers, providers, proof, and adapters
api/openapi.yaml             API contract
docs/                        Feature plans, runbooks, and implementation contracts
deploy/                      Docker, nginx, systemd, warm-inference deployment examples
data/*.json                  Checked-in examples and sample fallback data
legacy/static-prototype/     Original static prototype reference
backend/                     Older Python reference implementation
issues/                      Workstream briefs
```

Runtime data under `data/submissions/`, `data/forms/`, `data/fish/`, `data/proof/`, `data/ocean-batch/`, `data/staking/`, and `data/provider_allowlist.json` is intentionally ignored. Do not commit local ledgers, form exports, signing keys, provider allowlists, or secrets.

## Core Invariants

- Fish must remain product-first and token-second.
- Public copy must say Fish is Ocean Navy-built and built on Ocean Protocol, not official unless approved.
- Never claim guaranteed yield, guaranteed provider earnings, or that staking alone funds compute.
- Do not relabel mocks, fixtures, or sample fallbacks as live data.
- Preserve source-state labels: `live`, `snapshot`, `sample`, or `unavailable`.
- Keep prompt text and output text out of public proof, public dashboards, exports, and receipts unless a maintainer explicitly approves a different privacy model.
- Provider contacts, exact endpoints, API keys, payout preferences, operator notes, wallet references, and signing keys are private operator data.
- External fallback AI providers may receive prompt content. UI and docs must keep that visible where relevant.
- Direct Ocean provider or warm inference claims must be backed by configured routes and proof labels.
- Admin endpoints must require `FISH_ADMIN_TOKEN` in production.

## Implementation Rules

- Use TypeScript and existing Next.js App Router patterns for production code.
- Prefer existing helpers in `src/lib/` before adding a new abstraction.
- Keep public API response shapes synchronized with `api/openapi.yaml`.
- Keep user-facing copy aligned with `CONTENT_COPY.md` and the Fish/Ocean Navy voice in `README.md`.
- Keep UI styling aligned with `DESIGN.md`, Tailwind tokens, and existing component patterns.
- Use accessible HTML for text, buttons, forms, and metrics. Generated images should be text-free scene assets.
- Avoid storing raw prompts, raw outputs, API keys, or private provider data in JSON ledgers.
- Make fallback states explicit in UI and API responses.
- Keep code changes scoped to the feature area. Avoid broad refactors while implementing a small issue.

## Feature Areas

- Landing and public routes: `app/page.tsx`, `app/*/page.tsx`, `src/components/*`, `WEBSITE_SPEC.md`, `DESIGN.md`, `CONTENT_COPY.md`.
- Ocean supply dashboard: `app/api/ocean/*`, `src/lib/oceanSupply.ts`, `DASHBOARD_SPEC.md`, `docs/oncompute-ocean-data-sources.md`.
- Prototype Fish API and credits: `app/v1/*`, `src/lib/fishLedger.ts`, `src/lib/fishChatGateway.ts`, `docs/billing-topups-plan.md`.
- Routing and warm inference: `src/lib/fishRouter.ts`, `src/lib/routePolicy.ts`, `src/lib/vllmChat.ts`, `docs/warm-inference-runbook.md`, `docs/fish-runner-plan.md`.
- Provider pilot and proof: `app/api/providers/*`, `app/api/proof/*`, `src/lib/provider*`, `src/lib/fishLedger.ts`, `docs/provider-pilot-plan.md`.
- Batch jobs: `app/api/ocean/batch/jobs/route.ts`, `src/lib/oceanBatch.ts`, `docs/ocean-batch-jobs-plan.md`.
- Staking credits: `app/api/staking/*`, `src/lib/stakingCredits.ts`, `docs/ocean-staking-credits-plan.md`.
- Deployment: `Dockerfile`, `docker-compose.yml`, `deploy/*`, `docs/deployment.md`.

## Pull Request Checklist For Agents

Include this information in your PR or handoff:

- What changed and why.
- Routes, endpoints, docs, and environment variables affected.
- Source-state and privacy impact.
- Whether `api/openapi.yaml` needed updates.
- Validation commands run and their results.
- Any remaining TODOs or assumptions.

Run at least:

```bash
npm run verify
```

For UI work, also check the changed route on mobile and desktop. For API work, include at least one local `curl` or equivalent request against the changed endpoint.

