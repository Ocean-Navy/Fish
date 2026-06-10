# Fish (opfish) — Technical Audit & Improvement Plan

*Principal-level audit. Analysis only — no code was modified. Date: 2026-06-10. Auditor: automated principal review.*

Every finding below cites `file:line`. Two of the critical findings were **reproduced by executing the actual code** (noted inline). Where I could not verify something, I say so.

---

## 1. Executive Summary

**Overall health grade: C+** (a genuinely well-engineered prototype with strong security instincts, sitting on a persistence layer that loses money-equivalent data under normal concurrency).

Fish is a Next.js 16 / React 19 product layer that turns Ocean Network / Oncompute compute supply into an OpenAI-compatible AI API, with credits, payments (Stripe + Base USDC), provider proof dashboards, a faucet, and prototype Solidity staking contracts. The codebase is unusually disciplined for its stage: input is validated with zod, request bodies are size-capped, the Stripe webhook verifies signatures with a timing-safe compare, guest identity and the testnet faucet fail closed in production, the SSRF guard resolves DNS and blocks private ranges, and the contracts follow checks-effects-interactions with a Slither + invariant test harness. Tests assert behavior, not just execution, and there are zero committed secrets and zero `TODO`/`FIXME` markers.

That makes the central flaw more jarring: the core credit/account ledger (`src/lib/fishLedger.ts`, 2,012 lines) persists to a single local JSON file using a read-modify-write pattern that, on the account-creation, credit-top-up, and subscription paths, **does not hold the file lock the spend path uses**, and whose merge step drops concurrently-written records. I reproduced 5 concurrent API-key creations collapsing to **1 surviving account**, and a corrupted ledger file being **silently overwritten to empty** on the next write. For a system whose entire purpose is metering paid compute, this is the issue to fix before anything else.

The other systemic gaps are operational, not architectural: there is **no CI**, **no logging or error reporting anywhere** in the application, and every stateful guard (rate limit, concurrency, in-process lock) assumes a single process — which the architecture docs acknowledge but which still blocks the "scale to public" goal.

**Top 3 risks**
1. **Lost-update + silent-wipe in the money ledger** (`fishLedger.ts:480, 682, 1430, 1464`) — concurrent writes and file corruption both destroy account/credit state. *Reproduced.* **Critical.**
2. **No observability** — 0 logging/error-reporting calls across `src/` + `app/`; 23 silently-swallowed `catch` blocks in `src/lib`. Production incidents (including the data loss above) are invisible. **High.**
3. **No CI gate** — no `.github/`, no pipeline of any kind; `npm run verify` exists but nothing enforces it before merge to `main`, despite 100+ feature branches. **High.**

**Top 3 opportunities**
1. **Apply the lock + atomic write the repo already has.** `fishQuota.ts:96-101` already does tmp-file + `rename` under a lock directory. Porting that one pattern to `fishLedger` closes both Critical findings with low risk.
2. **One GitHub Actions workflow** running `npm run verify` + `npm run contracts:test` turns a strong-but-unenforced test suite into a real safety net — a few hours of work.
3. **Get the testnet contracts demonstrably correct** (run the suite + Slither locally, fund the reward loop if yield is shown). The contracts are the best-built part of the repo; a few operational steps keep the demo from *looking* broken. See §3.9.

> **Note:** this Executive Summary states *absolute* severities. After the owner Q&A, priorities were recalibrated for a testnet-first, no-real-money, prototype context — read **§1a** for what to actually do first. In short: contracts + demo-integrity now; scale, DB abstraction, and contract hardening deferred.

**Scope note.** I went deep on the core 20% that does 80% of the work: the ledger, the chat gateway, payments, the guard libraries (rate limit / quota / concurrency / identity / SSRF), and the staking contract. UI components (`src/components/*`, ~6k lines), the vendored `.deps/ocean-cli`, and the deployment shell/compose stacks received lighter review and are flagged where relevant.

---

## 1a. Priority Recalibration (after owner Q&A)

The owner clarified intent after the first pass. This reorders priorities materially — the engineering findings don't change, but their **severity and urgency** do. Read this as the authoritative priority lens; the per-finding severities in Section 3 are the "absolute" ratings, and this maps them to "what to actually do for *this* project, *now*."

> **Owner's stated reality:** (1) Testnet first, **no real money**, and testnet balances will **not** carry into the eventual paid deploy — "testing is for testing only." (2) Scale matters only "if this takes off." (3) Postgres/DB is "someday" — the current focus is **convincing users this is great**. (4) No observability tool preference. (5) Delete the dead `backend/` + `legacy/` code: yes. (6) Contracts are the **next real step on testnet** and should be "working correctly"; production comes after testnet.

> **Update (owner follow-ups, final plan): PHASED.** The demo must exercise the full e2e chain with **real AI** (GPU VM rented — mock not acceptable). Sequencing decision: **Phase 1 = Option A** (operator-scripted seams, ~zero new code) taken all the way through the **M0.9 full-chain rehearsal**; once that works, **Phase 2 = build the automation bridges** (§7 Workstreams B + C) to make the loop self-serve. This de-risks the build: the rehearsal validates contracts, GPU stack, credits, and settlement *before* any bridge code is written. **Two things must still happen in Phase 1 even though the bridges come later:** (1) the GPU/AI backend (M0.6) — real AI is mandatory in both phases; (2) the **`indexed user` contract change on `FishMinted`/`FishBurned`** (`FishOceanStaking.sol:64-65`) — bake it into the Phase-1 deploy so Phase 2 needs **no contract redeploy**. Full phased plan: **Section 7**.

**What this changes:**

- **The ledger bugs (B1/B2) are no longer a *money-loss* problem — they're a *demo-credibility* problem.** With no real money on the testnet ledger and balances not migrated, the failure mode shifts from "users lose funds" to "during a public demo meant to impress, accounts/credits silently vanish under concurrent use." That still undercuts goal (3). Because the fix is cheap (port an existing in-repo pattern), it stays a **do-before-public-concurrent-demo** item — reframed from "Critical/money" to "High/demo-integrity."
- **Contracts move UP.** Given (6), correctness of the three contracts is the most important thing for the *next* milestone. I did a dedicated deep pass — see new section **3.9 Smart Contracts**. Net: they're in good shape, with one operational gap that will make the demo look broken (rewards are inert until funded) and a couple of items to defer to the production gate.
- **Scale and the persistence abstraction move DOWN/OUT.** Per (2) and (3), I pulled the multi-node store interfaces (old M2.4) and the `LedgerStore` abstraction (old M2.1) **out of the active plan**. Do the minimal lock+atomic fix in place; don't build a migration seam for a "someday" DB.
- **Dead-code deletion is now a green-lit quick win** (5): remove `backend/` and `legacy/static-prototype/`.
- **Contract hardening (nonReentrant, external audit) is explicitly a *production-gate* item** per (6), not a testnet blocker.

**Recalibrated priority for *this* project:**

| Finding | Absolute severity | Do it now? | Why (per owner intent) |
|---|---|---|---|
| Contract reward funding gap (CC-1) | Medium | **Yes — before testnet** | Step 6 is testnet; demo shows zero yield unless funded |
| Run `contracts:test` + `contracts:security` locally (CC-6) | — | **Yes — before testnet** | Couldn't execute here; gate the deploy on green |
| Ledger lost-update + wipe (B1/B2) | Critical → **High (demo-integrity)** | **Yes — before public concurrent demo** | Cheap fix; silent data loss looks broken |
| CI pipeline (O1) + concurrency test (QW3) | High | **Yes — quick win** | Cheap insurance for an active multi-branch repo |
| Delete `backend/` + `legacy/` | Low | **Yes — quick win** | Owner approved; shrinks confusion |
| Outbound timeouts (B3) | Medium | **Yes — quick win** | Hung provider strands a demo request |
| Observability (O2/B4) | High | **Partial** | Minimal logging on error paths; skip a full stack |
| `LedgerStore` abstraction (was M2.1) | Medium | **Defer** | "Someday" DB — don't build the seam yet |
| Multi-node store interfaces (was M2.4) | Medium | **Defer** | Scale "not important right now" |
| Contract `nonReentrant` / external audit (CC-2) | Low (testnet) | **Defer to production gate** | Owner: production comes after testnet |
| Receipt-scan perf, retention (P1/P2) | Medium/Low | **Defer** | Only bites at scale |

The revised **Section 5 task plan** reflects this. Grade is unchanged (**C+**), but the *reason to act* is now "make the testnet demo solid and the contracts correct," not "protect money."

---

## 2. Repo Map

**Purpose.** "Fish" — an Ocean Navy-built product layer that resells Ocean/Oncompute compute as a simple, OpenAI-compatible AI API. Stake OCEAN → get FISH credits → spend on AI → providers get paid. Built on Ocean Protocol, explicitly *not* an official Ocean product (`AGENTS.md:3`).

**Maturity.** Pre-launch prototype heading to **no-real-money public testnet**. Paid mainnet checkout and external third-party proof are deliberately gated behind operator switches (`README.md:46-59`, `TECHNICAL_ARCHITECTURE.md:33-38`). Calibrate recommendations to "about to handle testnet credits that will later become real money," not "weekend toy."

**Stack.** TypeScript 5.8, Next.js 16.2.6 (App Router, standalone output), React 19.2, Tailwind 3.4, zod 3.25, viem 2.52. Node 22. Solidity contracts via Hardhat + OpenZeppelin (UUPS upgradeable). Tests via `node:test` + `tsx`. Lean dependency surface: **6 prod deps, 10 dev deps**.

**Control/data flow** (the hot path):
```
Browser / API client
  → app/v1/chat/completions/route.ts   (authenticateRequest → parse → gateway)
  → app/api/meal/order/route.ts        (anonymous guest → gateway)
      → src/lib/fishChatGateway.ts     (router policy, feature policy, privacy,
                                         rate limit, monthly limit, concurrency,
                                         route budget, daily quota, credit reserve)
          → vllmChat / oceanProviderChat / externalChat / oceanBatch (backends)
          → src/lib/fishLedger.ts       (reserve → record usage → receipt + credit entries)
  → data/fish/*.json                    (local JSON ledgers, file-locked)
```

**Key directories** (one line each):
- `app/` — App Router pages + API routes. `app/v1/*` = OpenAI-compatible API; `app/api/*` = product/proof/billing/ocean/staking/faucet routes (~50 route handlers).
- `src/lib/` — the real engine: ledgers, router, payments, providers, proof, guards, adapters (~70 modules). This is the 80%.
- `src/components/` — landing/dashboard/account/proof/chat UI (~25 components; 2 are >700 lines).
- `contracts/` — prototype `FishToken`, `FishOceanStaking`, `FishCapacityPool` (UUPS) + Hardhat tests + Slither harness.
- `deploy/` — Dockerfile context, nginx/systemd, warm-inference + Ocean demo stacks, Ocean workload adapter (`server.mjs`, 1,302 lines).
- `scripts/` — readiness audit, secret generation, backups, smoke tests (`.mjs`).
- `api/openapi.yaml` — 6,153-line API contract.
- `backend/` (Python) and `legacy/static-prototype/` — **reference only, not imported by the app** (verified: no `app/`/`src/` import references them).
- `docs/` — 20+ feature plans and runbooks. Extensive top-level docs (README is 980 lines).

**What surprised me** (in both directions):
- **Good surprise:** the security posture is far ahead of the persistence layer. Fail-closed identity, timing-safe webhook verification, DNS-resolving SSRF guard, body-size caps, admin-token weak-value rejection. Someone clearly did a security pass (git log shows dozens of `codex/fix-*-vulnerability` branches).
- **Bad surprise:** that same care didn't reach the most important file. The money ledger uses unlocked read-modify-write and a non-atomic overwrite, while a *sibling file* (`fishQuota.ts`) demonstrates the correct locked-atomic pattern. The good pattern exists; it just wasn't applied where it matters most.
- **Process surprise:** 100+ branches, a heavy security-remediation cadence, an `AGENTS.md` mandating `npm run verify` — and **no CI** to enforce any of it.

---

## 3. Audit Report

Findings are grouped by dimension and sorted by severity. **[FACT]** = directly verifiable in code/execution; **[JUDGMENT]** = my assessment. Each finding: what / where / why / severity.

### 3.1 Architecture & Design

**A1 — Single-node assumptions throughout the stateful guards. [FACT] — Medium**
Rate limiting (`src/lib/fishRateLimit.ts:27`, module-level `Map`), concurrency (`src/lib/fishConcurrency.ts:3-4`, module-level counters), the in-process ledger mutex (`fishLedger.ts:1397`, a module-level `Promise` chain), and file locks all live in one process's memory/filesystem. Run two containers (the docker-compose + nginx story invites exactly this) and rate limits, quotas, and concurrency caps are enforced per-replica, and the cross-host file lock races on a shared volume. *Consequence:* the stated "scale ledgers to a managed database" goal (`TECHNICAL_ARCHITECTURE.md:22`) is blocked, and any horizontal scale silently weakens billing guards. Calibrated Medium because the docs acknowledge it and the current target is single-node.

**A2 — `fishLedger.ts` is a 2,012-line god module. [JUDGMENT] — Medium**
It owns API keys, accounts, guest accounts, credit lanes/lots/expiry, reservations, receipts, usage/billing summaries, plans, monthly-limit accounting, locking, *and* JSON persistence (`fishLedger.ts:1-2012`). Every money path imports it, so coupling is maximal and the persistence mechanism can't be swapped or unit-tested in isolation. This is also *why* A1/B1 are hard to fix safely — there's no seam between "business rules" and "how bytes hit disk."

**A3 — Persistence is an implementation detail leaking into business logic. [FACT] — Medium**
Functions interleave domain decisions with `readFile`/`writeFile`/lock calls (e.g. `reserveFishCredits` at `fishLedger.ts:847` mixes balance math, lane selection, lock acquisition, and file writes). There's no `LedgerStore` abstraction, so the Postgres migration the architecture doc plans will require rewriting business logic, not just a driver.

### 3.2 Code Quality & Correctness

**B1 — CRITICAL: Lost-update race on the account/credit ledger. [FACT — reproduced]**
`createApiKey` (`fishLedger.ts:480`), `getOrCreateGuestAccount` (`:523`), `addFishCredits` (`:682`), and `activateFishSubscription` (`:746`) all do `readLedger()` → mutate in memory → `writeLedger()` **without** `withFishLedgerLock` (contrast the spend path: `reserveFishCredits:862`, `recordChatUsage:1050`, which *do* lock). `writeLedger` (`:1464`) builds the persisted ledger by mapping over **the caller's in-memory snapshot** and only consults the current file to preserve `revokedAt` — it never unions in accounts that other concurrent callers added.
*Reproduced:* 5 concurrent `createApiKey()` calls → **1 account persisted**, 4 lost.
*Consequence:* Concurrent key creation, credit top-ups, and **Stripe webhook deliveries** (`fishPayments.ts:407` → `addFishCredits`) race on one `accounts.json`. Stripe/USDC retries and parallel users silently drop accounts and granted credits. This is direct loss of money-equivalent state. **Critical.**

**B2 — CRITICAL: Silent ledger wipe on corrupt/partial JSON. [FACT — reproduced]**
`readLedger` (`fishLedger.ts:1430`) wraps `JSON.parse` in a bare `catch` that returns `{ accounts: [] }`. Writes use `writeFile` directly (`:1449`, `:1473`) with no temp-file + `rename`, so a crash mid-write leaves a truncated file. The *next* operation then reads "empty," and the following `writeLedger` **persists empty over the recoverable bytes.**
*Reproduced:* corrupt `accounts.json` → next write yields a 1-account file; all prior accounts gone, unrecoverable.
*Consequence:* one interrupted write or disk hiccup can zero every balance with no error surfaced. The correct pattern already exists at `fishQuota.ts:96-101` (tmp + `rename`) and isn't used here. **Critical.**

**B3 — Unbounded outbound calls on provider/external chat paths. [FACT] — Medium**
`runExternalChat` (`src/lib/externalChat.ts:58-73`) issues `fetch` with **no timeout/abort signal**. `runOpenAiCompatibleChat` applies a timeout **only if** `routeContext.timeoutMs` is set (`openAiCompatibleChat.ts:87`), and the warm/ocean callers don't pass one (`fishChatGateway.ts:321-332`). A hung upstream blocks the request while **holding a credit reservation and a concurrency slot** (`fishChatGateway.ts:263`, `:304`), so a slow provider can exhaust the concurrency cap and strand reserved credits. Medium because external fallback is plan-gated, but it's a real availability/resource leak.

**B4 — Errors swallowed without telemetry. [FACT] — Medium**
23 `catch` blocks in `src/lib` discard the error (e.g. `readPaymentLedger` rethrows only on non-`ENOENT` but `readLedger`/`readCreditLedger`/`readReceipts` swallow everything — `fishLedger.ts:1437, 1499, 1681`). Combined with B6 (no logging), genuine I/O failures are indistinguishable from "file absent" and vanish. Medium.

**B5 — Type-safety holes at trust boundaries. [JUDGMENT] — Low**
Provider/upstream payloads are parsed with hand-rolled `readPath`/`readString`/`readNumber` walkers (`openAiCompatibleChat.ts:163-182`) and `as` casts (`fishLedger.ts:1433` `as Ledger`, `:1500` `as CreditLedger`) rather than zod schemas. Inbound *client* requests are well-validated with zod; the asymmetry is on the *outbound-response* and *on-disk* boundaries. Low — currently defensive enough, but the on-disk casts are what make B2 silent.

### 3.3 Security

Overall: **strong**, with the caveats below. The hard gates (paid checkout, mainnet writes, guest salt, faucet) genuinely fail closed.

**S1 — SSRF guard has a DNS-rebinding TOCTOU window. [FACT] — Medium**
`validateProviderJobEndpoint` (`providerJobs.ts:658`) resolves the hostname, checks every resolved IP against private ranges (`isUnsafeEndpointAddress:704`, IPv4+IPv6, plus localhost/.local), then the caller `fetch`es **the hostname again** (`:624` → `:631-645`). An attacker-controlled DNS name can resolve "public" during validation and "169.254.169.254" at fetch time. Partly mitigated by `redirect: "error"` (`:644`) and by endpoints being operator-configured rather than arbitrary user input. Fix: resolve once and connect to the validated IP (or pin via `lookup`). Medium.

**S2 — Health endpoint is fine; several public reads are intentionally unauthenticated. [FACT] — Low (informational)**
`app/api/health/route.ts` returns only `{ok, service, timestamp}` — no leak (an earlier git commit, `fix-health-endpoint-hash-leak`, shows this was already remediated). ~27 routes have neither `requireAdmin` nor `authenticateRequest`, but these are public-by-design (waitlist intake, public proof summaries, sample dashboards, Stripe webhook which self-verifies). I verified the sensitive exports (`/api/*/export`, payouts, submissions, usage-analytics) **do** gate on `requireAdmin`. No finding beyond noting the surface is large and should stay covered by tests.

**S3 — `requireAdmin` allows no-token access outside production. [FACT] — Low**
`requireAdmin` (`fishLedger.ts:461-465`) returns `{ok:true}` when `FISH_ADMIN_TOKEN` is unset and `NODE_ENV !== "production"`. Correct for local dev, but it means a staging/preview box that forgets to set `NODE_ENV=production` exposes every admin route. The unsafe-placeholder rejection (`:455-459`) is a nice touch. Low; document the `NODE_ENV` dependency loudly.

**S4 — Config sprawl with no boot-time validation. [FACT] — Low**
109 distinct `process.env.*` reads across `src/` + `app/`, with no central schema despite zod being available. Misconfiguration surfaces as scattered runtime 503s rather than a single fail-fast at startup. Low, but it's cheap insurance for an operator-gated product.

*Security positives worth preserving:* timing-safe Stripe signature check with replay tolerance (`fishPayments.ts:740-768`), fail-closed guest identity (`guestIdentity.ts:40-55`), fail-closed faucet proxy identity with shared-secret + IP validation (`testnetFaucetIdentity.ts:18-43`), request body size limits (`requestBody.ts:15-23`), no committed secrets (only `.env.*.example` tracked; `.env.local`/`.env.ocean-demo-stack` confirmed untracked).

### 3.4 Testing

**T1 — Zero tests on the chat gateway and on route handlers. [FACT] — High**
`src/lib/fishChatGateway.ts` (1,034 lines, the orchestration brain) has **no test file**, and there are **no tests under `app/`** (verified: `find app -name '*.test.*'` is empty). The most branch-heavy, most security-relevant code — fallback logic, privacy downgrades, reservation release on every error path — is entirely unverified. High, because this is exactly where the money/privacy invariants live.

**T2 — Core ledger concurrency is under-tested. [FACT] — High**
There are good targeted tests (`fishLedgerApiKeyRace.test.ts` covers stale-key rotation/revocation; `fishLedgerSecurity.test.ts` covers expiry). But **no test exercises concurrent `createApiKey`/`addFishCredits`** — the exact gap that is B1. A 10-line test would have caught the Critical bug. High.

**T3 — 18 `src/lib` modules have no matching test. [FACT] — Medium**
Including `fishRouter.ts`, `oceanProviderChat.ts`, `vllmChat.ts`, `providerPayouts.ts`, `walletIntents.ts`, `marketMaking.ts`. No UI/component tests at all. Medium.

*Testing positives:* 40 test files; tests assert behavior, not execution (111 assertions in `fishPayments.test.ts`, 50 in `fishLedger.test.ts`); contracts have both a behavior suite and an **invariants** suite (`contracts/test/fish-contract-invariants.test.js`). The discipline is here — it just has blind spots in the highest-stakes spots.

### 3.5 Performance

**P1 — Receipt summaries read the entire receipts directory per call. [FACT] — Medium**
`readAllReceipts` (`fishLedger.ts:1668`) and the monthly counter (`countMonthlySucceededReceipts:1686`) enumerate and parse every receipt JSON file. `summarizeFishUsage`/billing analytics (`:950`, `:997`) fan out over all of them. As receipts accumulate, every usage summary and monthly-limit check degrades linearly and adds filesystem load to the request path. Medium — fine at testnet volume, a wall at scale, and another reason persistence needs a real store.

**P2 — Unbounded growth of on-disk ledgers. [FACT] — Low**
Receipts, credit entries, payout events, proof rows are append-only JSON files/dirs with no rotation or archival (`writeReceipt:1657`, `appendCreditEntries:1519`). Daily quotas *do* prune to 8 days (`fishQuota.ts:169-178`) — good — but nothing else does. Low now, compounds with P1.

Otherwise the hot path is reasonable: no N+1 DB queries (no DB), outbound calls are mostly single requests, streaming is faked from a complete body (`chatCompletionStream.ts`) which is fine for a prototype.

### 3.6 Dependencies

**D1 — Healthy. [FACT] — Low (one note)**
6 prod / 10 dev deps, all current (Next 16.2.6, React 19.2, viem 2.52, zod 3.25). Lockfile present and committed. One `overrides` pin for `postcss` under Next (`package.json:39-43`). The only smell is the **vendored `.deps/ocean-cli/`** (a full TypeScript CLI with its own `src`, `dist`, and tests checked into the tree and git-ignored) — it inflates the repo and blurs the line between "our code" and "vendored tooling." Low. License is AGPL-3.0 (`package.json:5`) — note the copyleft implications for any closed-source provider integrations.

### 3.7 DevEx & Operations

**O1 — HIGH: No CI/CD whatsoever. [FACT]**
No `.github/`, no GitLab/Circle config (verified). `npm run verify` (lint + `test:app` + typecheck + build) and `npm run contracts:test` exist and are documented as the pre-PR gate (`AGENTS.md:122-126`), but nothing enforces them. With 100+ `codex/*` branches merging security fixes into `main`, the absence of an automated gate is the single highest-leverage process gap. High.

**O2 — HIGH: No logging, metrics, or error reporting. [FACT]**
**Zero** `console.*` / logger / Sentry / `captureException` calls in all of `src/` + `app/` (verified by grep). There is no way to observe a failed payment, a swallowed ledger error (B4), a backend timeout (B3), or the data loss (B1/B2) in production. For a payments-adjacent service this is a High operational gap. High.

**O3 — Build `start` script does manual file shuffling. [FACT] — Low**
`package.json:9` hand-copies `.next/static` and `public` into the standalone output at *start* time. Workable, but brittle and a sign the standalone packaging isn't fully wired. The Dockerfile does this copy correctly at build time (`Dockerfile:38-39`), so the npm `start` path is the odd one out. Low.

*Ops positives:* non-root Docker user (`Dockerfile:31-44`), healthchecks in both Dockerfile and compose, named volumes for each data dir, a real readiness-audit tool (`scripts/audit-public-testnet-readiness.mjs`, 1,058 lines) with strict/advisory modes, and a runtime backup script.

### 3.8 Documentation

**Doc1 — Abundant and mostly accurate, occasionally aspirational. [JUDGMENT] — Low**
README (980 lines), `AGENTS.md`, `TECHNICAL_ARCHITECTURE.md`, `PRODUCT_SPEC.md`, 20+ `docs/*`, and a 6,153-line `openapi.yaml`. Onboarding path is clear (`nvm use; npm ci; npm run dev`). The docs are refreshingly honest about gates and sample-vs-live labeling. Two soft issues: (a) `TECHNICAL_ARCHITECTURE.md:175-251` specifies Postgres tables that **don't exist yet** — correctly framed as "later," but a new reader can mistake them for current; (b) the docs describe the local-JSON ledger as "acceptable… with backups" (`:22`) without flagging the concurrency/atomicity caveats this audit found. Low. Update the architecture doc to mark B1/B2 as known limitations until fixed.

### 3.9 Smart Contracts (deep pass — added after owner Q&A)

Since the testnet contract run is the next milestone (owner answer 6), I reviewed all three contracts and the deploy script in full. **Verdict: the contracts are the best-engineered part of the repo** — careful reward math, conservation invariants, and a real test suite. The issues below are mostly operational (will the demo behave?) rather than safety defects.

**CC-1 — Staking rewards are inert until the operator funds them. [FACT] — Medium (demo-blocking if yield is part of the story)**
`deploy-testnet.js` grants the minter role and configures the mint curve (`:57-58`, `:64`, `:128-138`) but **never calls `setEmissionRate` or `fundEmissions`**. So after deploy `emissionRatePerSecond == 0` and `emissionReserve == 0`, which makes `pendingRewards`/`claim()` return **0** (`FishOceanStaking.sol:294`, `:351`). This is *correct and tested* behavior (the invariant suite asserts "no emissions without reward-eligible supply," `fish-contract-invariants.test.js:61`) and aligns with the "never claim guaranteed yield" invariant — but if the testnet demo intends to *show* OCEAN staking rewards, stakers will see zero. *Action before testnet:* add a runbook step (or extend the deploy script behind a flag) to `setEmissionRate(...)`, `approve`, then `fundEmissions(...)` from the emission source.

**CC-2 — `FishOceanStaking` has no `ReentrancyGuard`, but `FishCapacityPool` does. [FACT] — Low (testnet) / address at production gate**
`FishCapacityPool` imports and applies `nonReentrant` to every state-changing external (`FishCapacityPool.sol:24,127,142,171,199,229,241`). `FishOceanStaking` has none, despite making external token calls in `stake/claim/mintFish/burnFish` (`:180,336,236,258`). It's **safe on testnet** because it follows checks-effects-interactions (state written before transfers) and OCEAN/FISH are trusted non-callback tokens you control. The asymmetry suggests the two contracts got different levels of polish. *Action:* add `nonReentrant` to the six `FishOceanStaking` mutators as defense-in-depth before the **production** deploy (owner answer 6: production follows testnet).

**CC-3 — FISH→OCEAN unlock is per-user and requires holding the FISH. [FACT/JUDGMENT] — Low (surface in UI)**
To reclaim locked OCEAN you must call `burnFish`, which requires both holding the FISH (`FishOceanStaking.sol:241`) and having `outstandingFishAmount` on your own `lockedStake` (`:243`). FISH is a normal transferable ERC20, so a user who sends their minted FISH away **cannot unlock their OCEAN**, and the new holder (no `lockedStake`) can't either — the OCEAN is effectively stranded. This is the inherited Venice/DIEM design, not a bug, but testnet users will trip on it. *Action:* make the "hold your FISH to reclaim OCEAN" rule explicit in the staking UI/copy.

**CC-4 — Capacity-pool unstaking is serialized one batch at a time. [FACT] — Low (operational)**
`flush()` requires `currentUnstakeBatch == oldestUnclaimedUnstakeBatch` (`FishCapacityPool.sol:172`), and the pointer only advances when someone calls `claimUnstakeBatch` (`:206`). So a single un-claimed flushed batch blocks all subsequent flushes; everyone queued after is stuck until someone claims the prior batch. `claimUnstakeBatch` is permissionless once `unlockAt` passes, so it's not a hard deadlock, but a forgotten claim stalls exits. *Action:* note in the runbook; consider a keeper that auto-claims ready batches.

**CC-5 — `recordPaidUsage` with zero stakers orphans the net USDC. [FACT] — Low (edge)**
If the operator records paid usage while `totalStaked == 0`, the USDC is pulled in and the fee taken, but `_distributeUsdcInstant` returns early (`FishCapacityPool.sol:312`) so the net amount is neither distributed nor reserved — it becomes owner-sweepable "orphan" USDC (`sweepOrphanUsdc:300`) rather than being refunded. Operator controls timing, so low impact; just don't record usage before there are stakers.

**CC-6 — Contract tests could not be executed in this environment. [FACT] — Process**
The Solidity compiler download is network-blocked in the audit sandbox (`hardhat compile` → proxy 403), so I verified the **suite by reading it**, not by running it. The suite is well-formed (conservation invariants, role boundaries, emission-gating — `fish-contract-invariants.test.js:6-147`) and there's a Slither harness (`contracts/scripts/run-static-analysis.js`). *Action before testnet:* run `npm run contracts:test` and `npm run contracts:security` locally (where the compiler is available) and gate the deploy on green. Always deploy via `deploy-testnet.js` — a hand-rolled proxy deploy that skips `configureMintCurve`/`grantRole` would leave `mintFish`/`burnFish` non-functional.

*Contract strengths worth preserving:* conservative reward rounding that provably prevents `emissionReserve` underflow (`FishOceanStaking.sol:389-390`), non-transferable sOCEAN (`:416-419`), UUPS storage-layout discipline with a documented append-only slot (`:55-58`), deploy script that refuses Base mainnet (`deploy-testnet.js:11-13`) and uses short testnet cooldowns, and a genuine invariant test suite.

### 3.10 Strengths (preserve these)

- **Security-by-default guards that fail closed** — identity, faucet, paid/mainnet gates, admin weak-token rejection.
- **Timing-safe, replay-aware Stripe verification** (`fishPayments.ts:740`).
- **DNS-resolving SSRF protection** (`providerJobs.ts:658`) — better than most production codebases.
- **Behavior-asserting tests + contract invariants** — the testing *culture* is right.
- **Contracts follow checks-effects-interactions** (state before `safeTransfer`/`mint`/`burn`, `FishOceanStaking.sol:202-260`), gated `_authorizeUpgrade` (`:414`), with a Slither harness.
- **Lean, current dependency tree** and clean git hygiene (no secrets, no TODOs).
- **The correct persistence pattern already exists in-repo** (`fishQuota.ts` lock-dir + tmp + `rename`) — the fix for the Critical findings is a port, not an invention.

### 3.11 End-to-End Testnet Chain Readiness — THE gap for "full e2e must work"

The owner's goal: in the testnet demo, the **full chain from staking testOCEAN through to using AI (and providers getting paid) must work end-to-end.** I traced every link. **Finding: the two halves of the chain — the onchain contract lifecycle and the AI credit/usage system — are not connected by code. They're bridged by manual operator actions, and "use AI" defaults to a mock unless a real backend is running.** This is the single most important thing to resolve before the demo, and it's not a bug — it's an unbuilt integration.

The intended narrative is *stake OCEAN → catch FISH → use AI → providers get paid → Ocean grows.* Link by link:

| # | Link | Status | Evidence | What it needs |
|---|------|--------|----------|---------------|
| 1 | Stake testOCEAN onchain → sOCEAN | ✅ Works | Browser wallet via `window.ethereum`/`eth_sendTransaction` (`EvmContractActionPanel.tsx:56-128`); contract correct | Nothing — user's wallet signs |
| 2 | Mint FISH onchain (lock sOCEAN) | ✅ Works | Same client-wallet path; mint curve set by deploy script | Funded curve (deploy does it) |
| 3 | **Onchain FISH/stake → spendable Fish Credits (unlocks AI)** | ❌ **No bridge** | **Nothing watches onchain events** — zero `getLogs`/`watchEvent`/`queryFilter` in `src/lib`. Credits come only from the admin-gated offchain `/api/staking/positions` → `createApiKey` (`stakingCredits.ts:88`), which does **no onchain verification** — `oceanAmount` is an operator-typed number, `walletRef` is just hashed, yet the row is labeled `sourceState:"live"` (`stakingCredits.ts`) | A bridge (watch FISH-mint events → issue credits), **or** an operator who manually issues credits after watching the chain |
| 4 | Use AI (spend credits) | ⚠️ Mock by default | Active route falls back to `"mock"` when `FISH_CHAT_ROUTE` is unset (`fishRouter.ts:45,167`); real routes need `FISH_OCEAN_DEMO_VLLM_BASE_URL`+model (`:130-133`) or an Ocean provider/external backend | The private Ocean demo stack / vLLM **actually running and configured**, or the demo shows a canned mock answer |
| 5 | **AI usage → USDC settlement to providers (capacity pool)** | ⚠️ Manual | `recordPaidUsage` is driven by the admin route `/api/proof/capacity-settlements` with an operator-typed gross/net USDC amount (`README:881`); it is **not** computed from actual usage receipts. Onchain submit only if `FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true` + operator key | A reconciliation step (usage receipts → settlement amount), **or** an operator who triggers settlement with a chosen amount |
| 6 | Capacity stakers claim USDC | ✅ Works | Client-wallet `claim_usdc` (`fishContracts.ts:55`); pool accounting verified | Nothing — user's wallet signs |

**So what actually works today:** the *onchain lifecycle* is complete and self-serve (stake → mint → capacity-stake → settle → claim, all via the `/credits` panel and the user's wallet), and the *AI side* is complete (issue credits → spend on AI → receipts → settlement). But **links 3 and 5 are operator-manual seams**, and **link 4 is a mock** unless you stand up the inference backend.

**Decision made: PHASED — Option A first, through the M0.9 rehearsal; then Option B's bridges.** Real AI on the rented GPU VM is mandatory in both phases. The full plan is in **Section 7**. In short:

- **Phase 1 (Option A, ~zero new code):** deploy contracts (with the Phase-2-ready event change), stand up the GPU `warm` stack, and have the operator drive the two seams live — verified stake → `/api/staking/positions` issues credits (the response returns a one-time API key to hand the tester, `stakingCredits.ts:111`); after usage → `/api/proof/capacity-settlements` with `submitOnchain:true` (already supports approve + `recordPaidUsage` + idempotency, `capacitySettlements.ts:26-36,139`). Gate: one unbroken operator-driven rehearsal (M0.9). *Honesty rule:* demo copy says "operator-verified" — don't claim automation yet.
- **Phase 2 (Option B bridges, after the rehearsal passes):** replace the two manual seams with code — **Workstream B** (wallet sign-in + confirmation-lagged event watcher → idempotent `addFishCredits`) and **Workstream C** (settlement reconciled from real usage receipts). No contract redeploy needed if Phase 1 shipped the `indexed user` event change.

---

## 4. Improvement Strategy

Five themes explain nearly every finding.

**Theme 1 — Durability of the ledger is the demo's credibility, and it's cracked.**
*Findings:* B1, B2. *Target state:* every credit/account mutation is atomic, serialized, and crash-safe. *Principle:* the ledger is the source of truth; even on testnet it must never silently lose or zero a balance during a demo. *Done when:* concurrent writes never drop records, a corrupt/partial file never overwrites good data, and a concurrency test proves it. *Recalibrated (§1a):* fix this **in place** with the lock + atomic-write pattern already in `fishQuota.ts` — do **not** build the `LedgerStore` abstraction (old A3) now; that's deferred with the "someday" DB.

**Theme 2 — The system is invisible in production.**
*Findings:* O2, B4, B3. *Target state:* structured logging on every error path, error reporting wired, and outbound calls bounded by timeouts. *Principle:* you cannot operate — or trust — what you cannot see. *Done when:* every `catch` either handles or logs with context, and a failed payment/backend call produces a searchable log line.

**Theme 3 — Nothing enforces the quality bar the team already set.**
*Findings:* O1, T1, T2, T3. *Target state:* CI runs `verify` + `contracts:test` on every PR and blocks merge on failure; the gateway and ledger-concurrency have tests. *Principle:* an unenforced standard is a suggestion. *Done when:* `main` is protected by green CI and the two Critical-adjacent areas are covered.

**Theme 4 — Single-node assumptions cap the roadmap. [DEFERRED per §1a]**
*Findings:* A1, A2. The owner confirmed scale is "not important right now" and the DB is "someday." **Deferred** — do not build store interfaces or stand up Redis/Postgres yet. Recorded here so it isn't forgotten when the paid deploy is scoped; revisit then. The only Theme-4-adjacent work worth doing now is *not painting yourself into a corner* (e.g., keep the lock/atomic fix from Theme 1 self-contained so a future store swap is a drop-in).

**Theme 5 (contracts) — Make the testnet contracts demonstrably correct. [NEW, per §1a]**
*Findings:* CC-1…CC-6. *Target state:* contracts deploy via the script, the reward loop is funded if yield is shown, the suite + Slither run green locally, and the per-user FISH-unlock rule is surfaced in the UI. *Principle:* the next milestone is a testnet run — it should behave exactly as the demo narrative promises. *Done when:* `contracts:test` + `contracts:security` pass locally, a funded-rewards smoke test shows non-zero `pendingRewards`, and the runbook covers funding + batch-claim keeping.

**Theme 6 — Sharp edges on the trust boundary.**
*Findings:* S1, S3, S4, B5. *Target state:* SSRF connects to validated IPs; env validated at boot; on-disk/upstream payloads parsed with zod. *Principle:* validate once, at the edge, and fail fast. *Done when:* a startup env check exists and the SSRF TOCTOU is closed.

### Explicit non-goals (what I recommend NOT doing now, and why)

- **Don't migrate to Postgres/Redis, and don't build the `LedgerStore` abstraction this milestone.** Per owner answers (2)(3), the DB is "someday." The atomic-write + lock fix (Theme 1) makes the *current* file store correct for single-node testnet in hours. Just keep that fix self-contained so a future store swap stays easy.
- **Don't refactor the 2,012-line god file wholesale.** Do the in-place lock/atomic fix and leave the rest. A broad refactor mid-launch is pure risk with no user-facing payoff, and `AGENTS.md:97` already discourages it.
- **Don't add `nonReentrant` / commission an external contract audit for the *testnet* run.** CEI is followed and tokens are trusted; this is a **production-gate** item per owner answer (6). Tracked as CC-2.
- **Don't build observability infrastructure** (dashboards, tracing). Per answer (4), just add minimal structured logging on error paths so a failed demo is debuggable.
- **Don't add component/UI tests yet.** The UI isn't where the invariants live; spend the testing budget on the gateway and ledger.
- **Don't chase scale perf (P1/P2) or multi-node guards (A1).** Deferred per §1a until the paid deploy is scoped.

### Definition of "done" (measurable)

- **Contracts green locally**: `npm run contracts:test` + `npm run contracts:security` pass before the testnet deploy; a funded smoke shows non-zero `pendingRewards` (if yield is demoed).
- **No silent ledger loss**: concurrency + corruption tests pass against `fishLedger` (10 parallel creates → 10 persist; corrupt file never wipes).
- **CI blocks merge** on `npm run verify` and `npm run contracts:test`.
- **Gateway test coverage ≥ 80%** of `fishChatGateway.ts` branches (fallback + reservation-release paths especially).
- **Every `src/lib` error path logs** with context; outbound chat calls have a default timeout.
- **One startup env-validation check** fails fast on missing required secrets in production.

---

## 5. Task Plan

Effort: **S** <2h · **M** half-day · **L** 1–2 days · **XL** needs breakdown. "Risk" = risk of the change itself breaking things.

*Re-ordered per §1a around the owner's real sequence: **contracts → testnet → public demo → eventual paid deploy**. "Money-safety" language is replaced by "demo-integrity."*

### Quick wins (high impact, S effort — do immediately)

| # | Task | Why | Effort | Risk |
|---|------|-----|--------|------|
| QW1 | Add GitHub Actions running `npm run verify` + `npm run contracts:test` on PRs; protect `main` | Turns an existing-but-unenforced suite into a real gate (O1) | S | Low |
| QW2 | Default timeout on `externalChat` fetch + pass `timeoutMs` from gateway callers | Hung provider strands a demo request + holds a credit/concurrency slot (B3) | S | Low |
| QW3 | Concurrency test: 10 parallel `createApiKey`/`addFishCredits`, assert all persist | Locks in the B1 fix and prevents regression (T2) | S | Low |
| QW4 | Boot-time zod env validation for required production secrets | Fail fast instead of scattered 503s (S4) | S | Low |
| QW5 | **Delete `backend/` (Python) and `legacy/static-prototype/`** | Owner-approved (answer 5); unimported dead code, shrinks confusion | S | Low |
| QW6 | Add a contract demo runbook: fund emissions + claim-keeper note + FISH-unlock rule | Prevents the "zero yield / stuck OCEAN" demo surprises (CC-1, CC-3, CC-4) | S | Low |

### Milestone 0 — Phase 1: e2e chain working with operator-driven seams (Option A)

*~Zero new code. Real AI included. The Phase-1 deploy bakes in the Phase-2 contract change so Phase 2 needs no redeploy. Gate to Phase 2: M0.9 passes.*

| # | Task | Files | Acceptance | Effort | Risk | Deps |
|---|------|-------|-----------|--------|------|------|
| M0.1 | Run `npm run contracts:test` + `npm run contracts:security` locally; fix any failures | `contracts/**` | Both green on your machine (couldn't run here — CC-6) | S | Low | — |
| M0.2 | Fund the reward loop — `setEmissionRate` + `approve` + `fundEmissions` | `deploy-testnet.js` or runbook | Funded smoke shows non-zero `pendingRewards` (CC-1) | S | Low | M0.1 |
| M0.3 | Surface the per-user "hold your FISH to reclaim OCEAN" rule in UI/copy | `src/components/*`, copy | A user can't be surprised into stranding OCEAN (CC-3) | S | Low | — |
| M0.4 | **Add `indexed user` to `FishMinted`/`FishBurned`** (Phase-2-ready), re-run contract tests, deploy via `deploy-testnet.js` | `FishOceanStaking.sol:64-65` | Phase 2 can key the bridge on mint events without redeploy (§7 B3) | S | Low | M0.1 |
| M0.5 | **Write + rehearse the Option A operator runbook** (§7-A0): verify stake on Basescan → issue credits → hand key → settle with `submitOnchain` | runbook / `docs/*` | Operator can run the loop unaided; copy labels it "operator-verified" | S | Low | M0.6 |
| M0.6 | **Stand up the real AI backend** — `deploy/ocean-demo-stack` `warm` profile on the GPU VM; `FISH_CHAT_ROUTE=ocean-demo-vllm` | `.env*`, `deploy/ocean-demo-stack/*` | `/ask` returns a real answer, `costState:"provider_verified"`, verified runner receipt (§7-A) | M | Med | — |
| M0.9 | **Phase-1 gate: full-chain rehearsal on Base Sepolia**, operator driving the seams | — | One unbroken run: stake → mint → operator-issued credits → real AI → `submitOnchain` settlement → claim USDC | M | Med | M0.1–M0.6 |

### Milestone 0-B — Phase 2: automate the seams (Option B bridges; starts after M0.9 passes)

| # | Task | Files | Acceptance | Effort | Risk | Deps |
|---|------|-------|-----------|--------|------|------|
| M0.7 | **Credit bridge** — wallet sign-in (viem `verifyMessage`) + confirmation-lagged event watcher → idempotent `addFishCredits` on `txHash:logIndex`; retire the mislabeled `"live"` admin path | new `src/lib/*`, `fishLedger.ts:682`, `walletIntents.ts` | Stake/mint onchain auto-issues verified credits; replay/restart/reorg tests pass (§7-B) | XL | High | M0.9, M1.2/M1.3 |
| M0.8 | **Settlement reconciliation** — sum usage receipts (`sumProviderCostForRouteSince`) → `recordPaidUsage`; settlement watermark + idempotency | `fishLedger.ts:1342`, `capacitySettlements` | Provider USDC derives from real usage, counted once (§7-C) | L | Med | M0.9 |
| M0.10 | **Phase-2 gate: self-serve rehearsal** — a tester drives the whole loop with no operator | — | Connect wallet → stake → auto-credits → real AI → auto-settlement → claim USDC, untouched by operator | M | Med | M0.7, M0.8 |

### Milestone 1 — Before a public, concurrent demo (demo-integrity)

| # | Task | Files | Acceptance | Effort | Risk | Deps |
|---|------|-------|-----------|--------|------|------|
| M1.0 | CI pipeline + branch protection | `.github/workflows/*` | PR fails on lint/test/typecheck/build error | S | Low | — |
| M1.1 | Concurrency + corruption regression tests (reproduce B1/B2 first) | `fishLedger.test.ts` | Tests fail on today's code, pass after M1.2/M1.3 | S | Low | M1.0 |
| M1.2 | **Lock the create/credit/subscription paths** under `withFishLedgerLock`; make `writeLedger` union, not overwrite | `fishLedger.ts:480,523,682,746,1464` | 10 concurrent creates → 10 persist; webhook race test passes | M | Med | M1.1 |
| M1.3 | **Atomic writes** (tmp + `rename`) for all ledger files; treat corrupt ≠ absent | `fishLedger.ts:1449,1473,1506,1660,1430,1499` | Kill -9 mid-write leaves prior file intact; corrupt file errors loudly instead of wiping | M | Med | M1.1 |
| M1.4 | Minimal structured logging on `src/lib` error paths (no infra, just a logger) | `src/lib/*.ts` (23 swallow sites) | A failed payment/backend/ledger op emits a searchable line (O2/B4) | M | Low | — |

### Milestone 2 — Polish while testnet runs

| # | Task | Files | Acceptance | Effort | Risk | Deps |
|---|------|-------|-----------|--------|------|------|
| M2.1 | Gateway tests to ≥80% branch coverage (fallback, privacy-downgrade, reservation-release) | `fishChatGateway.test.ts` | Coverage gate met; each error path asserts reservation release (T1) | L | Low | M1.0 |
| M2.2 | Close SSRF DNS-rebind window: connect to the validated IP | `providerJobs.ts:624,658` | Rebind test (public→private) blocked at fetch (S1) | M | Med | — |
| M2.3 | `NODE_ENV` admin-dependency doc + tests asserting export routes stay gated | `fishLedger.ts:461`, route tests | Test fails if an export route loses `requireAdmin` (S3) | S | Low | M1.0 |
| M2.4 | Fix the `start` script packaging (build-time copy, like the Dockerfile) | `package.json:9` | `npm start` needs no manual file shuffle (O3) | S | Low | — |

### Deferred (recorded, not scheduled — revisit when the paid deploy is scoped)

| Item | Trigger to revisit | From |
|---|---|---|
| `LedgerStore` abstraction + Postgres/Redis migration | Paid deploy scoping / real money | A3, was M2.1 |
| Multi-node store interfaces for rate-limit/quota/concurrency | Horizontal scale needed (answer 2) | A1, was M2.4 |
| `nonReentrant` on `FishOceanStaking` + external contract audit | Production contract deploy (answer 6) | CC-2 |
| Receipt-scan perf (indexing/rollups) + ledger retention | Volume grows past testnet | P1, P2 |
| zod schemas for upstream/on-disk payloads | When swapping persistence | B5, B3.3 |
| Move vendored `.deps/ocean-cli` to a real dep | Housekeeping | D1 |

### Top-3 task implementation sketches

**M1.2 — Lock + union the ledger write path**
*Approach:* wrap the four unlocked mutators in `withFishLedgerLock` (the same file lock the spend path uses), and change `writeLedger` so the merge **unions** the current file's accounts with the caller's, keyed by `id`, rather than projecting only the caller's snapshot.
*Steps:* (1) wrap `createApiKey`/`getOrCreateGuestAccount`/`addFishCredits`/`activateFishSubscription` bodies in `withFishLedgerLock(async () => { const ledger = await readLedger(); … })` so the read happens *inside* the lock; (2) in `writeLedger` (`:1464`) build `mergedById` from `currentLedger.accounts` first, then apply the caller's account objects on top (caller wins for fields it owns, current wins for `revokedAt` per existing `preserveCurrentRevocation`); (3) drop the now-redundant module-level `ledgerWriteQueue` *only after* the lock covers all writers, or keep it as a second line of defense.
*Gotchas:* reading *before* acquiring the lock is the actual bug — the snapshot goes stale. The read must move inside the critical section. Don't widen the lock around the outbound backend call (that would serialize all inference). Keep credit-entry append (`appendCreditEntries`) inside the same lock so the receipt and the balance can't diverge.

**M1.3 — Atomic ledger writes**
*Approach:* copy the proven pattern from `fishQuota.ts:96-101` — write to `"<file>.<pid>.<ts>.<rand>.tmp"` then `rename` over the target (rename is atomic on POSIX).
*Steps:* (1) add a `writeJsonAtomic(path, data)` helper; (2) replace the four direct `writeFile`s (`:1449,1473,1506,1660`); (3) add a test that writes garbage to a tmp path, kills before rename, and asserts the live file is unchanged.
*Gotchas:* tmp file must be on the **same filesystem/dir** as the target or `rename` falls back to a non-atomic copy (Docker volume boundaries matter — keep tmp inside the data dir). `fsync` the dir if you need durability guarantees across power loss; for this stage rename-atomicity is enough.

**M2.2 / S1 — Close the SSRF TOCTOU**
*Approach:* resolve once, validate, then connect to the resolved IP rather than re-resolving the hostname.
*Steps:* (1) in `validateProviderJobEndpoint` return the chosen safe IP alongside the URL; (2) in the caller (`providerJobs.ts:624`) `fetch` against the IP with a `Host` header set to the original hostname (or use an `undici` Agent with a pinned `lookup`); (3) keep `redirect: "error"`; (4) add a test where DNS returns public on first lookup and a private IP on the second.
*Gotchas:* TLS SNI/cert validation breaks if you naively swap the host for an IP — set the `Host`/SNI to the original name. Preserve the existing IPv6 and localhost/.local checks; only the *connect target* changes.

---

## 6. Open Questions — all resolved by owner (2026-06-10)

All original open questions are answered; resolutions are baked into §1a, §3.11, Section 5, and the Section 7 build plan. Recorded here for traceability:

1. **Real-money timeline →** Testnet is no-real-money; balances are **not** migrated to the eventual paid deploy. *Effect:* B1/B2 reframed from money-loss (Critical) to demo-integrity (High); still worth the cheap fix.
2. **Scale →** Not important now. *Effect:* A1 / multi-node interfaces **deferred**.
3. **Postgres/DB →** "Someday"; focus is convincing users. *Effect:* `LedgerStore` abstraction **deferred**; fix the file store in place.
4. **Observability →** No tool preference. *Effect:* add **minimal** structured logging on error paths; no infra build-out.
5. **Delete `backend/` + `legacy/` →** Yes. *Effect:* promoted to quick win **QW5**.
6. **Contracts →** Testnet is the next real step; contracts should be "working correctly"; production after testnet. *Effect:* contracts moved **up** (new Milestone 0 + §3.9); `nonReentrant`/external audit **deferred to the production gate**.

**All resolved (owner follow-ups).** The demo must exercise the **full** e2e chain with **real AI** (GPU VM rented; mock unacceptable). Final sequencing: **Phase 1 = Option A** (operator-driven seams, ~zero new code) through the **M0.9 rehearsal gate**, then **Phase 2 = the automation bridges** (§7 B + C) for the self-serve loop. Nothing is left open — the path is set:

- **Phase 1:** contracts green + `indexed user` event change baked into the deploy (M0.4) + funded emissions (M0.2) + GPU `warm` stack (M0.6) + operator runbook (M0.5, §7-A0) → **M0.9 operator-driven full-chain rehearsal**.
- **Phase 2 (after M0.9):** credit bridge (M0.7, §7-B) + settlement reconciliation (M0.8, §7-C) → **M0.10 self-serve rehearsal**.

**Standing guidance:** (1) land the **B1/B2 ledger lock+atomic fix before opening Phase 1 to the public** — concurrent guest/credit writes are exactly the unlocked paths; (2) ship the **`FishMinted`/`FishBurned` indexed-user change in the Phase-1 deploy** so Phase 2 needs no redeploy; (3) build M0.7 behind a **feature flag, Base-Sepolia-only**, with the §7-B5 replay/reorg tests — that bridge becomes your mainnet money path; (4) keep Phase-1 demo copy honest: "operator-verified," not "automated."

---

## 7. Phased E2E Build Plan (Phase 1: Option A through rehearsal → Phase 2: automation bridges)

**Final sequencing (owner decision):** prove the chain with operator-driven seams first (Phase 1, ~zero new code), gate on the M0.9 rehearsal, then build the automation (Phase 2 = Workstreams B + C). Real AI (Workstream A) is mandatory from Phase 1. **Guiding principle for Phase 2: the bridges you build for testnet *are* your mainnet money path** — idempotent, verified, confirmation-lagged, locked, and tested against replays/reorgs. Do the B1/B2 ledger lock+atomic fix (M1.2/M1.3) before Phase 2, because both bridges write to that ledger (and before any *public* concurrent demo in either phase — `getOrCreateGuestAccount` races are public-facing today).

### Workstream A0 — Phase 1 operator runbook (Option A seams, M0.5)

The two seams the operator drives live, using only existing endpoints:

1. **Stake → credits (seam 3).** Tester stakes testOCEAN / mints FISH from the `/credits` panel with their own wallet. Operator verifies the tx on Sepolia Basescan (address, amount, confirmations), then issues exactly the verified amount: `POST /api/staking/positions` with `x-fish-admin-token`, `{holderLabel, walletRef: <verified address>, oceanAmount: <verified>, lockDays}`. The response returns a **one-time Fish API key** (`stakingCredits.ts:111`) — hand it to the tester through the session channel; Fish stores only the hash.
2. **Usage → settlement (seam 5).** After the tester's AI usage, operator reads the summed provider cost (receipts / `/api/usage/summary`), then `POST /api/proof/capacity-settlements` with `submitOnchain: true` and a unique `idempotencyKey` (required — `capacitySettlements.ts:32-36`). The route checks operator authorization, approves USDC, calls `recordPaidUsage`, waits for confirmation (`capacitySettlements.ts:139`). Tester then claims USDC from the `/credits` panel.
3. **Honesty rule:** demo copy and proof labels say "operator-verified" — the §3.11 caveat that `createStakingPosition` stamps `sourceState:"live"` without onchain checks is *acceptable in Phase 1 only because the runbook makes the operator the verifier*; Phase 2 retires this path.
4. *Gotchas:* keep `FISH_ADMIN_TOKEN` long/random and only used server-side (never from a browser console on the demo box); enter only amounts you actually verified; one settlement per rehearsal segment, keyed by date, so idempotency stays meaningful.

### Workstream A — Real AI on the GPU VM (link 4, M0.6 — Phase 1, mandatory)

This is the lowest-risk piece; the stack already exists in `deploy/ocean-demo-stack/`.

1. **Rent an NVIDIA GPU VM.** The default model is `Qwen/Qwen3-8B` (`docker-compose.yml` vllm service) — ~16 GB VRAM; there are `env.qwen3-14b-l40s.example` / `env.qwen3-8b-fp8-16gb.example` profiles in `deploy/warm-inference/` if you size up/down. Needs the NVIDIA Container Toolkit (the compose already requests `driver: nvidia, count: all`).
2. **Configure and start the warm profile:** copy `deploy/ocean-demo-stack/env.example` → `.env.ocean-demo-stack`, set `HUGGING_FACE_HUB_TOKEN`, `FISH_VLLM_API_KEY`, `FISH_RUNNER_API_KEY`, and a `FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM` (generate with `scripts/generate-fish-runner-key.mjs`). Then `make ocean-demo-up-warm`. This brings up `vllm` (OpenAI-compatible, port 8001) behind `fish-runner` (port 8088), which adds **signed receipts** — those signatures are what make `costState:"provider_verified"` real and feed the proof/settlement story.
3. **Point the web app at it:** set `FISH_CHAT_ROUTE=ocean-demo-vllm`, `FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<vm>:8088/v1` (the runner, not raw vLLM), `FISH_OCEAN_DEMO_VLLM_API_KEY`, `FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat`. Use `npm run ocean-demo:web-env` to generate the overlay.
4. **Acceptance:** `/ask` returns a real model answer; a receipt shows `route:"ocean-demo-vllm"`, `costState:"provider_verified"`, and a verified `runnerReceipt.signatureState`. *Gotchas:* keep the GPU box private (bind 127.0.0.1 + reverse-proxy or VPN; don't expose vLLM publicly); pass a real `timeoutMs` on the runner call (ties to QW2) so a stuck GPU doesn't strand the request; pre-pull the model so the first demo request isn't a 60-second cold start.

### Workstream B — Onchain → AI credit bridge (link 3, M0.7 — Phase 2, the hard one)

Goal: a tester connects their wallet, stakes/mints onchain, and **automatically** receives spendable Fish Credits, with no operator. Three parts:

**B1. Wallet sign-in (authn).** Today there is *no* wallet→account auth — `walletIntents.ts:107` records signatures as `submitted_unverified` and never recovers the signer. Add a SIWE-style flow: nonce → user signs → server verifies with viem `verifyMessage`/`recoverMessageAddress` (viem is already a dep) → derive a **stable** Fish account from the address (mirror the deterministic `guestAccountId` pattern in `fishLedger.ts:1310`, e.g. `walletAccountId(addr)`), and hand back / bind that account's API key. *Gotcha:* bind credits to the verified address, never to a `walletRef` the client merely claims.

**B2. Confirmation-lagged event watcher (the bridge).** A single server-side worker that polls Base Sepolia with viem `getLogs` (or `watchContractEvent`) over the staking contract, **lagging N confirmations** (suggest 5–10 on Base Sepolia). Persist a `lastProcessedBlock` cursor (atomic write, same pattern as the ledger) so restarts resume instead of rescanning. For each new confirmed event, issue credits via the **existing idempotent** `addFishCredits({ accountId, amount, lane:"staking", idempotencyKey: \`base-sepolia:${txHash}:${logIndex}\`, ... })` (`fishLedger.ts:682` already supports `idempotencyKey` — reused from the Stripe path). Idempotency on `txHash:logIndex` is what makes replays and restarts safe.

**B3. Which event, and the contract gap.** Credit the **lock that mints FISH**, but `FishMinted`/`FishBurned` **don't carry the user address** (`FishOceanStaking.sol:64-65`) — only `Staked`/`Claimed` do (`:60,63`). Two clean options, pick one **before** deploy:
   - *(preferred)* change to `event FishMinted(address indexed user, uint256 sOceanLocked, uint256 fishMinted)` (and same for burn) — a one-line, low-risk contract edit that makes the watcher trivial and robust; or
   - key the bridge off `Staked(user, amount)` (already indexed) and derive credits from staked OCEAN rather than minted FISH.
   Avoid the third option (parsing `tx.from` of `mintFish` calls) — it's fragile and breaks with meta-txns/multisigs.

**B4. Verification + honesty.** Because the watcher reads confirmed chain state, the credit rows can *finally* be labeled `sourceState:"live"` truthfully — fixing the current mislabel where operator-typed amounts in `createStakingPosition` are stamped `"live"` without any onchain check. Replace/retire that admin path (or gate it to "manual adjustment" with a distinct label).

**B5. Tests (non-negotiable for a mint path).** Unit: same event processed twice → credits once. Restart mid-scan → no double-credit. Reorg (event hash changes) → no double-credit, and the orphaned credit is reconciled. Wrong-decimals guard. These are the tests that keep a bridge bug from becoming a credit-printing exploit on mainnet.

*Effort:* L (B1) + L (B2/B3) + M (B5) ≈ XL overall. *Risk:* High — it's new authn + a money path. Build it behind a feature flag, default off, enable only on Base Sepolia (mirror the existing `chainId===84532` gating in the secrets generator).

### Workstream C — Usage → provider settlement reconciliation (link 5, M0.8 — Phase 2)

Goal: provider USDC payout derives from **actual AI usage**, not an operator-typed number. The primitive already exists: `sumProviderCostForRouteSince(route, sinceIso)` (`fishLedger.ts:1342`) sums provider cost from receipts.

1. A scheduled (or manually-triggered) reconciler sums unsettled provider cost since the last settlement watermark, converts to USDC, and calls the existing capacity-settlement path (`/api/proof/capacity-settlements` → `recordPaidUsage` onchain when `FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true`).
2. Persist a settlement watermark (last receipt timestamp/id settled) so each receipt is counted once; reuse the `idempotencyKey` on the settlement to prevent duplicate onchain submits.
3. *Acceptance:* run AI usage → reconciler computes a settlement matching summed receipts → capacity stakers' `claimUsdc` reflects real usage. *Gotcha:* decide the USD→USDC rounding and a minimum-settlement threshold so you don't submit dust txns every interval; the capacity pool already no-ops a zero distribution (`FishCapacityPool.sol:312`), but you'll still pay gas.

### Sequencing (phased)

**Phase 1 (Option A):**
`M0.1 contracts green` → **M0.4 add `indexed user` to mint/burn events (Phase-2-ready), re-test** → `M0.2 fund emissions` → deploy via `deploy-testnet.js` → `M0.6 GPU/AI warm stack` (parallelizable with contract work) → `M0.5 operator runbook` → **M0.9 Phase-1 gate: operator-driven full-chain rehearsal on Base Sepolia** — stake → mint → operator-issued credits → real AI → `submitOnchain` settlement → claim USDC, one unbroken run.

**Before opening Phase 1 to the public:** land `M1.2/M1.3` (ledger lock + atomic writes) — the unlocked `getOrCreateGuestAccount`/`addFishCredits` paths are exactly what concurrent public testers will hit — plus QW1 CI and QW2 timeouts.

**Phase 2 (after M0.9 passes):**
`M0.7 credit bridge (B1 wallet sign-in → B2 watcher → B5 replay/reorg tests)` → `M0.8 settlement reconciliation` → **M0.10 Phase-2 gate: self-serve rehearsal** — a tester drives the entire loop with no operator touch. No contract redeploy is needed because M0.4 shipped the event change in Phase 1.

The phase gate is deliberate: everything the bridges automate (credit amounts, settlement math, claim flows) will have been validated by hand in M0.9, so Phase-2 bugs are isolated to the *bridge code itself* — much easier to debug than chain + GPU + bridge all at once.

---

*Reproduced findings (B1, B2) were verified by executing `src/lib/fishLedger.ts` against a temp data directory. Contracts and the deploy/GPU stack were reviewed by reading source, tests, and compose/env files; the contract suite could not be executed here (compiler download blocked) — run it locally before deploy. Line numbers reference the repository state at audit time. UI components and `.deps/ocean-cli` received lighter review.*
