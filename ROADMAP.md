# Fish Roadmap

## Roadmap principle

Build the product first. Prove demand. Then add token utility.

## Phase 0 — Landing page and Ocean Network dashboard

**Goal:** make the concept credible and measurable.

Deliverables:

- public landing page;
- `DESIGN.md` design system;
- Ocean Network supply dashboard;
- provider pilot form;
- user/developer waitlist;
- market-making report template;
- public roadmap.

Success criteria:

- the page explains the idea in under 30 seconds;
- data dashboard can ingest or display Ocean Network supply;
- at least 3 providers express pilot interest;
- at least 20 users/developers express demand interest.

## Phase 1 — AI app/API prototype

**Goal:** create one simple AI product surface.

Deliverables:

- chat UI;
- API keys;
- OpenAI-compatible `/v1/chat/completions`;
- `/v1/models`;
- usage receipts;
- internal Fish Credits ledger;
- external fallback route, if needed;
- admin usage dashboard.

Success criteria:

- users can make real AI calls;
- usage is metered;
- credits are debited;
- costs are tracked;
- product works without token mechanics.

## Phase 2 — Ocean provider pilot

**Goal:** route real workloads to selected Ocean Network providers.

Deliverables:

- provider registry;
- provider onboarding flow;
- selected provider allowlist;
- batch inference adapter;
- signed usage receipts;
- provider payout accounting;
- proof dashboard.

Success criteria:

- 3–5 selected providers complete test jobs;
- provider payouts are recorded;
- Ocean-native jobs are visible on dashboard;
- first cost-per-workload benchmark report exists.

## Phase 3 — Market-making engine

**Goal:** match consistent AI demand with reliable compute supply.

Deliverables:

- GPU supply snapshots;
- benchmark matrix;
- provider scorecard;
- routing rules;
- cost model;
- first public market-making report.

Success criteria:

- the team knows which models/workloads are profitable;
- provider reliability is ranked;
- Fish can define honest pricing.

## Phase 4 — OCEAN staking credits

**Goal:** create user-side OCEAN utility.

Deliverables:

- OCEAN staking contract or offchain staking prototype;
- credit budget policy;
- staking dashboard;
- credits earned from staking;
- credits spendable in API.

Success criteria:

- users can stake OCEAN and earn credits from a funded budget;
- providers are paid from real revenue/reserves;
- dashboard shows OCEAN staked and credits spent.

## Phase 5 — Warm inference and stronger AI product

**Goal:** move from batch jobs to faster API experience.

Planning detail: see `docs/fish-runner-plan.md`.

Deliverables:

- provider `fish-runner`;
- vLLM/SGLang/TGI integration;
- streaming chat;
- model health checks;
- failover routing;
- provider signed receipts.

Success criteria:

- Ocean-native chat works for selected models;
- latency and throughput are dashboarded;
- fallback routing works.

## Phase 6 — Provider OCEAN bonds

**Goal:** create supply-side OCEAN utility.

Planning detail: see `docs/provider-bonds-plan.md`.

Deliverables:

- provider bond contract;
- routing eligibility based on bond + score;
- soft penalties;
- dispute workflow;
- public provider bond metrics.

Success criteria:

- providers can bond OCEAN;
- bonded providers receive pilot routing priority;
- bad providers can be suspended without hurting users.

## Phase 7 — Credits/tokenization later

**Goal:** make Fish Credits more composable only after usage exists.

Planning detail: see `docs/tokenized-credits-plan.md`.

Deliverables:

- restricted Fish Credits / WATER-style token spec;
- legal review;
- audit;
- burn-to-unlock logic;
- optional capacity pool.

Success criteria:

- tokenized credits are backed by real usage and settlement;
- no unfunded provider liability;
- legal and risk controls are documented.

## Phase 8 — Venice-style feature parity

**Goal:** gradually match the valuable product layers of Venice, not just its token loop.

Commercial layer detail: see `docs/billing-topups-plan.md`.

See `VENICE_PARITY_ROADMAP.md`.
