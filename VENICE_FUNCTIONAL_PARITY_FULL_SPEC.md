# Fish — Full Venice-Style Functional Parity Specification

**Status:** expanded roadmap addendum  
**Purpose:** define the long-term path from the Fish landing/dashboard MVP to a Venice-style product loop built on Ocean Network / Oncompute.  
**Important framing:** this is **functional inspiration**, not a brand, UI, legal, or code copy. Fish should build its own product, terms, model routing, provider rules, token mechanics, and privacy claims.

---

## 0. Executive summary

The existing Fish package contains a **limited Venice-style parity roadmap**. It covers the right major groups, but only at high level. A real 1:1 functional parity plan needs a much more detailed matrix across:

1. consumer app;
2. developer API;
3. model catalog;
4. billing, subscriptions, and credits;
5. wallet/API-key flows;
6. privacy modes;
7. provider routing and fallback;
8. Ocean Network provider settlement;
9. OCEAN staking and credit generation;
10. FISH/WATER-style tokenized credits;
11. capacity pool and third-party capacity markets;
12. admin, compliance, legal, abuse, and observability.

The practical sequence remains:

```text
Market-making and landing page
→ simple AI app/API
→ credits ledger
→ provider pilot
→ usage/proof dashboard
→ OCEAN staking
→ warm inference
→ provider bonds
→ tokenized credits
→ capacity pool
→ privacy hardening
→ full multimodal app/API parity
```

---

## 1. What “Venice-style parity” means

Venice is not just a token system. Its valuable loop is:

```text
consumer app
+ developer API
+ model router
+ billing system
+ privacy proxy
+ subscriptions
+ API credits
+ staking / DIEM mechanics
+ token dashboard
+ external integrations
```

Fish parity therefore means **recreating the product loop**, not simply launching a token.

### Fish translation

```text
Venice app/API             → Fish app/API
Venice private model router→ Fish Gateway
Venice providers/backends  → Ocean Network providers + fallback APIs
VVV staking                → OCEAN staking
DIEM                       → Fish Credits / later FISH/WATER tokenized credits
Venice subscriptions       → Fish plans / top-ups / API credits
Venice privacy modes       → Fish privacy tiers
Venice usage dashboard     → Fish usage + Ocean provider proof dashboard
```

---

## 2. Parity matrix

| Area | Venice-style capability | Fish equivalent | MVP? | Long-term? |
|---|---|---|---:|---:|
| Consumer app | Chat, model picker, local history, media tools | Fish web app | Yes | Yes |
| Developer API | OpenAI-compatible API | `/v1/chat/completions`, `/v1/models`, later images/audio/video | Yes | Yes |
| API keys | User keys, agent/web3 keys, limits | Fish API keys + wallet-linked keys | Yes | Yes |
| Billing | Credit balance, usage analytics, subscription credits | Fish Credits ledger + billing dashboard | Yes | Yes |
| Subscriptions | Monthly plans with credit bundles | Fish plans | No | Yes |
| Token staking | Stake token for API access/credits | Stake OCEAN for credits | No | Yes |
| Tokenized credits | DIEM-like transferable compute asset | FISH/WATER-style credits | No | Yes |
| Mint/burn unlock | Lock staked token, mint credit asset, burn to unlock | Lock OCEAN/sOCEAN, mint credits, burn to unlock | No | Yes |
| Provider routing | Hide compute backends behind app/API | Fish Gateway routes to Ocean providers/fallbacks | Yes | Yes |
| Multimodal | Text, image, video, audio, embeddings, tools | Staged model/API expansion | Partial | Yes |
| Privacy modes | Anonymous, Private, TEE, E2EE | External, Ocean Private, Hardened, TEE, E2EE | Partial | Yes |
| Usage analytics | Usage by date, model, API key, spend type | Fish analytics + provider proof dashboard | Yes | Yes |
| x402 / wallet payments | Wallet-native pay-per-request/top-up | Optional Fish wallet payments | No | Yes |
| Agent ecosystem | LangChain, SDKs, MCP, agent docs | Fish SDK + agent docs | No | Yes |
| Capacity markets | DIEM can be used by third-party capacity protocols | Fish capacity pool | No | Yes |

---

## 3. Product roadmap to full parity

### Phase 0 — Market-making and proof landing

**Goal:** prove that Ocean Network supply exists and can be converted into AI demand.

Deliverables:

- Fish landing page.
- Ocean Network supply dashboard.
- Provider intake form.
- User/developer waitlist.
- Public market-making report template.
- Live/static supply cards: GPU type, price, available supply, provider count.

Success criteria:

- page explains Fish in under 30 seconds;
- dashboard ingests Oncompute/Ocean Network data or clearly labeled snapshots;
- first provider list exists;
- first demand list exists.

### Phase 1 — Consumer app and developer API shell

**Goal:** one product surface before token mechanics.

Deliverables:

- Web chat app.
- Wallet/email login.
- API key management.
- `GET /v1/models`.
- `POST /v1/chat/completions`.
- Streaming support.
- Simple usage page.
- External fallback provider route.

Success criteria:

- users can call the API;
- usage is recorded;
- prompt/output/token counts are metered;
- product works without OCEAN staking.

### Phase 2 — Fish Credits ledger

**Goal:** build the accounting layer before issuing tokenized credits.

Deliverables:

- internal credit accounts;
- admin credit grants;
- top-up credits;
- usage debit entries;
- failed-request refunds;
- spend priority rules;
- credit balance API;
- billing usage analytics.

Initial spend priority:

```text
Fish Credits → subscription credits → prepaid balance → external payment
```

Required endpoints:

```text
GET  /v1/billing/balance
GET  /v1/billing/usage
GET  /v1/billing/usage-analytics
POST /v1/topups
POST /v1/admin/grants
```

### Phase 3 — Ocean provider pilot

**Goal:** use Ocean Network providers behind Fish Gateway.

Deliverables:

- provider registry;
- selected provider allowlist;
- Ocean batch adapter;
- provider payout accounting;
- provider receipt format;
- provider scorecard;
- first Ocean-native requests.

Provider payment rule:

```text
Users can pay with credits or fiat/USDC, but providers get paid in hard settlement tokens first.
```

Do **not** require providers to accept FISH/WATER credits at launch.

### Phase 4 — Proof dashboard

**Goal:** make the economics visible.

Dashboard metrics:

- users;
- API calls;
- credits issued;
- credits spent;
- Ocean-native requests;
- external fallback requests;
- provider payouts;
- provider cost;
- gross margin;
- OCEAN staked;
- OCEAN bonded;
- OCEAN bought/locked/burned later;
- refunds/failures;
- top models;
- top provider classes.

### Phase 5 — Subscription and top-up system

**Goal:** copy the commercial product layer.

Deliverables:

- Free tier.
- Pro tier.
- Team/API tier.
- Usage-based API top-ups.
- Credit bundle accounting.
- Plan limits and rate limits.
- Monthly credit grants.
- Credit banking rules.
- Stripe/crypto checkout integration.

Subscription credits must be backed by a provider-payment budget or reserve policy.

### Phase 6 — OCEAN staking credits

**Goal:** create user-side OCEAN utility.

Deliverables:

- staking vault or staking proof system;
- OCEAN lock periods;
- credit earning rate;
- funded credit budget;
- staking dashboard;
- credit claim flow;
- staking analytics;
- risk controls.

Core rule:

```text
Staking does not magically pay providers.
Credits issued to stakers must be funded by revenue, reserves, DAO budget, or collateral.
```

### Phase 7 — Warm inference and Fish Runner

**Goal:** move from batch jobs to Venice-like low-latency AI.

Deliverables:

- provider `fish-runner`;
- vLLM/SGLang/TGI support;
- model warm pools;
- streaming token responses;
- provider health checks;
- failover;
- signed usage receipts;
- prompt/log redaction;
- provider telemetry.

### Phase 8 — Provider bonds

**Goal:** create provider-side OCEAN utility and quality control.

Deliverables:

- ProviderBondVault.
- Provider eligibility status.
- Bond-weighted routing, capped by performance.
- Provider score dashboard.
- Soft penalties.
- Dispute workflow.
- Later slashing for objective fraud only.

### Phase 9 — Tokenized credits

**Goal:** make Fish Credits composable only after product usage exists.

Design choices:

- non-transferable credits;
- restricted-transfer credits;
- transferable ERC20;
- ERC1155 credits by class;
- offchain ledger + onchain bridge.

Required controls:

- credit liability cap;
- reserve dashboard;
- pause controls;
- audit;
- legal review;
- provider settlement coverage;
- no guaranteed yield unless explicitly structured and reviewed.

### Phase 10 — Mint/burn debt mechanic

**Goal:** copy the strongest Venice-style token utility mechanic.

Flow:

```text
Lock OCEAN or sOCEAN
→ mint Fish Credits / FISH
→ use or allocate credits
→ burn/repay credits to unlock OCEAN
```

Risk controls:

- max LTV;
- credit issuance caps;
- volatility buffers;
- oracle policy;
- emergency unwind rules;
- no underfunded provider liability.

### Phase 11 — Capacity pool

**Goal:** allow unused AI credits to become marketable capacity.

Flow:

```text
OCEAN holders earn credits
→ allocate unused credits to pool
→ external users buy AI
→ pooled credits are consumed
→ providers get paid
→ pool accounting updates
```

Revenue sharing or USDC distributions require legal review and possibly jurisdiction controls.

### Phase 12 — Privacy modes

**Goal:** match the privacy ladder, honestly.

Fish privacy ladder:

1. `External` — routed to external provider; provider policies apply.
2. `Ocean Private` — selected no-log Ocean providers.
3. `Ocean Hardened` — approved containers, log redaction, stronger isolation.
4. `Ocean TEE` — hardware-attested provider environment.
5. `E2EE-to-TEE` — client-side encrypted prompts, decrypted only in verified enclave.

Do not call V1 “cryptographically private.” Only TEE/E2EE tiers earn that claim.

### Phase 13 — Multimodal parity

**Goal:** grow from text/chat into one API for many AI workloads.

Order:

1. Chat/text.
2. Embeddings.
3. Rerank.
4. Batch document processing.
5. Image generation through fallback or Ocean-native providers.
6. Audio/TTS.
7. Video generation.
8. Agent tools and web search.
9. Characters/personas.
10. Enterprise RAG/document workflows.

### Phase 14 — Agent/developer ecosystem

Deliverables:

- JS/TS SDK.
- Python SDK.
- OpenAI SDK compatibility guide.
- LangChain adapter.
- Vercel AI SDK examples.
- CrewAI/agent examples.
- MCP server.
- Wallet-native API key minting.
- x402-style pay-per-request, optional.

### Phase 15 — Admin, compliance, abuse, and legal rails

Deliverables:

- admin dashboard;
- model/provider controls;
- abuse monitoring;
- sanctions/geofence policy if needed;
- data retention policy;
- provider agreements;
- user terms;
- subscription terms;
- credit terms;
- token risk memo;
- issuer/operator entity.

---

## 4. API surface required for parity

### Core user/API key endpoints

```text
POST /v1/auth/wallet/nonce
POST /v1/auth/wallet/verify
POST /v1/api_keys
GET  /v1/api_keys
PATCH /v1/api_keys/{id}
DELETE /v1/api_keys/{id}
GET  /v1/api_keys/{id}/usage
```

### Model and inference endpoints

```text
GET  /v1/models
POST /v1/chat/completions
POST /v1/embeddings
POST /v1/rerank
POST /v1/batches
GET  /v1/batches/{id}
POST /v1/images/generations
POST /v1/images/edits
POST /v1/audio/speech
POST /v1/audio/transcriptions
POST /v1/videos/generations
```

### Billing endpoints

```text
GET  /v1/billing/balance
GET  /v1/billing/usage
GET  /v1/billing/usage-analytics
POST /v1/billing/topups
GET  /v1/billing/invoices
GET  /v1/billing/plans
POST /v1/billing/subscribe
POST /v1/billing/cancel
```

### Staking/credit endpoints

```text
GET  /v1/staking/positions
POST /v1/staking/stake
POST /v1/staking/unstake
POST /v1/staking/claim-credits
POST /v1/credits/mint
POST /v1/credits/burn
GET  /v1/credits/debt
```

### Provider endpoints

```text
POST /v1/providers/apply
GET  /v1/providers
GET  /v1/providers/{id}
GET  /v1/providers/{id}/score
GET  /v1/providers/{id}/payouts
POST /v1/providers/{id}/bond
POST /v1/providers/{id}/unbond
```

### Public proof dashboard endpoints

```text
GET /public/stats/summary
GET /public/stats/supply
GET /public/stats/provider-payouts
GET /public/stats/ocean-utility
GET /public/stats/credits
GET /public/stats/models
```

---

## 5. Data model required for parity

Minimum tables:

```text
users
wallets
api_keys
sessions
models
model_prices
provider_registry
provider_scores
provider_bonds
provider_payouts
requests
usage_receipts
credit_accounts
ledger_entries
subscriptions
topups
invoices
staking_positions
credit_debts
capacity_pool_deposits
capacity_pool_usage
privacy_modes
audit_logs
admin_actions
```

---

## 6. Smart contracts required for parity

### Early contracts

- `OCEANStakingVault`
- `ProviderBondVault`
- `TreasuryController`

### Later contracts

- `FishCredits` / `FISH` / `WATER` token contract.
- `CreditDebtVault`.
- `CreditBurnUnlock`.
- `CapacityPoolVault`.
- `SettlementVault`.
- `ReserveOracle`.
- `ProviderRegistry`.

---

## 7. Legal and institutional dependencies

Functional parity requires an operator entity, even before tokenization, because Fish needs to:

- sell subscriptions or credits;
- contract with providers;
- pay providers;
- define refund rules;
- manage user terms;
- manage privacy/data policy;
- operate support;
- handle abuse;
- hold treasury funds;
- interact with payment processors;
- take legal responsibility for credit redemption.

Tokenized credits, revenue sharing, or capacity-pool USDC distributions add substantially more legal complexity.

---

## 8. What is intentionally not day-one

These should not be in V1:

- transferable credit token;
- `$1/day forever` promise;
- direct provider payment in FISH/WATER;
- yield marketing;
- E2EE claims;
- fully open provider marketplace;
- arbitrary Docker execution for consumer chat;
- unsupervised slashing;
- official Ocean Protocol product claims.

---

## 9. DAO/proposal framing

The full pitch should be:

```text
Fish starts as a product layer on top of Ocean Network.
It turns compute supply into AI demand.
It pays providers from real usage or reserves.
It gives OCEAN utility through staking, provider bonds, credit creation, and later value capture.
It only tokenizes credits once real usage and settlement exist.
```

The goal is not “launch a Venice copy.”

The goal is:

```text
Build a Venice-style product loop for Ocean,
with OCEAN as the coordination asset.
```
