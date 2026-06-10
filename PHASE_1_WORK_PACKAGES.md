# Phase 1 — Work Package Map

*Companion to `AUDIT_REPORT.md`. This document breaks all of Phase 1 into self-contained packages you can execute one at a time. **Track A** (WP1–WP8) is the non-Solidity app/ledger/CI/docs/UI work; **Track B** (SC1–SC4) is the Solidity / on-chain work. Each package has a ready-to-paste kickoff prompt so you can start a focused Fable 5 session per package and stop cleanly between them.*

**How to use this doc:** pick a package, paste its "Kickoff prompt" into a fresh message, let Fable 5 implement just that package, review, commit, move on. The packages are ordered so dependencies come first, but WP2–WP8 are largely independent and can be reordered.

---

## 0. Model note — staying on Fable 5

**You asked why work on this repo seems to switch you to Opus 4.8. I re-checked the repository directly (fresh context, not trusting the earlier finding) and confirmed: the switch is not coming from this repo.**

Evidence (all verifiable):
- No tracked Claude/agent config: no `.claude/` directory, no `CLAUDE.md`, no `settings.json`, no `.mcp.json`, no agent definitions (`git ls-files` matches nothing).
- No untracked `.claude/` directory on disk either.
- Zero references to `opus`, `claude-opus/sonnet/haiku/fable`, or model routing in tracked files. The only "model routing" hits are your **own product** docs (Venice parity, billing plans) — your app's feature, not a Claude setting.

**So what causes it?** Cowork/Claude Code can use a separate model for the *agentic execution* phase versus *conversation*. Yours appears set to Opus 4.8 for "do the work," which was a sensible default before Fable 5 existed. Per Anthropic's positioning, **Fable 5 sits above Opus 4.8 in capability** (it's the most intelligent generally available model), so that default now hands the hardest part of the job to the weaker model. The lever is a platform/account setting, not anything in this repo.

**Honest limit:** I can't see your account/app settings from inside the chat, so I can't read the exact toggle or flip it for you. Look in **Cowork Settings → model / capabilities** for an execution / agent / "high-effort" model set to Opus 4.8 and switch it to Fable 5. I can search the official docs to confirm the exact setting name if you want.

**Does any Phase 1 package need Opus? No — including the Solidity track.** Track A is standard TypeScript / Next.js / docs / CI. Track B is Solidity 0.8 + Hardhat — and Fable 5 is the more capable model there too, so there's **no capability reason to switch to Opus** for the contracts. The real safety net for contract work isn't a different model, it's the **test suite + Slither static analysis + (before mainnet) an external audit** — process rigor, not model choice. The "Model" line on each package says **Fable 5**. The one package I recommend *you* run rather than an agent is **SC4 (deploy)** — not for capability reasons, but because it uses your deployer private key, and you should never paste a real key to any agent. If a future package genuinely needed Opus, I'd say so and explain why; none of these do.

**How to keep execution on Fable 5 in practice:**
- Run each package as its own conversation in this thread; the main loop stays on whatever you're on now.
- If any step delegates to a subagent, it will be pinned to `model: fable` explicitly — never an Opus-pinned agent.
- The one thing outside my control is platform routing of the main loop — that's the Settings toggle above.

---

## 1. Scope

**In scope (this doc):** all of Phase 1, in two tracks.
- **Track A — non-Solidity (WP1–WP8):** the app/ledger/CI/docs/UI work that makes the operator-driven (Option A) end-to-end demo solid and safe for concurrent public testers.
- **Track B — Solidity / on-chain (SC1–SC4):** the contract source change, test/security run, emission-funding path, and Base Sepolia deploy that the demo's staking loop runs on. Maps to `AUDIT_REPORT.md` §7 milestones M0.1, M0.2, M0.4.

The two tracks touch different files and can run **in parallel**. They converge at the deploy (SC4) and the operator rehearsal.

**Still out of scope (genuinely yours / not a code package):**
- Running the GPU VM warm stack — your infrastructure (WP8 prepares the config/docs only).
- The **M0.9 operator rehearsal** itself — a manual exercise, not a code package (WP7 writes the runbook for it).
- External contract audit + `nonReentrant` hardening — deferred to the **production** gate, not Phase 1 (see SC6 note).

---

## 2. Package summary

**Track A — non-Solidity**

| WP | Title | Effort | Risk | Depends on | Why it matters |
|----|-------|--------|------|------------|----------------|
| WP1 | Ledger durability fix + regression tests | L | Med | — | Stops silent account/credit loss under concurrent public testers (audit B1/B2) |
| WP2 | Outbound timeouts on chat paths | S | Low | — | A hung GPU/provider can't strand a demo request + hold a credit/concurrency slot (B3) |
| WP3 | Boot-time env validation | S–M | Low | — | Fail fast on missing prod secrets instead of scattered 503s (S4) |
| WP4 | Delete dead code (`backend/`, `legacy/`) | S | Low | — | Removes 2.6 MB of unimported reference code; shrinks confusion |
| WP5 | CI workflow (verify + contracts:test) | S | Low | — | Enforces the quality bar `AGENTS.md` already sets but nothing gates (O1) |
| WP6 | "Hold your FISH to reclaim OCEAN" UI/copy | S | Low | — | Stops testers stranding locked OCEAN (audit CC-3) |
| WP7 | Phase-1 operator runbook | S | Low | WP6 (light) | The Option A seam mechanics, written down and rehearsable |
| WP8 | GPU/AI backend prep (env template + wiring docs) | S–M | Low | — | Makes "use AI" real, not mock; you run the VM, this preps the config |

**Track B — Solidity / on-chain**

| SC | Title | Effort | Risk | Depends on | Why it matters |
|----|-------|--------|------|------------|----------------|
| SC1 | Add `indexed user` to `FishMinted`/`FishBurned` | S | Med | — | Phase-2 credit bridge can key on mint events; free now, a redeploy later (audit CC-6/§7-B3) |
| SC2 | Run `contracts:test` + `contracts:security` (Slither), fix findings | S–M | Low | SC1 | Gate the deploy on green; I couldn't run these (compiler download blocked) — verify on your machine (CC-6) |
| SC3 | Emission-funding path (so staking shows rewards) | S | Low–Med | SC1 | Without it `claim()`/`pendingRewards` are zero; demo shows no yield (audit CC-1) |
| SC4 | Deploy to Base Sepolia + generate web overlay | S | Med | SC1–SC3 | Puts the contracts live and wires the app; **you run it** (holds your deployer key) |

**Highest value (Track A):** WP1. **Do WP1 + WP2 + WP5 before opening the demo to the public.** **Track B is the critical path to the on-chain demo** — SC1→SC2→SC4 must all land before the M0.9 rehearsal. Total across both tracks: roughly 1–1.5 focused days.

---

## 3. Sequencing

```
Track A (non-Solidity) — before any PUBLIC concurrent demo:
  WP1 (ledger durability)  ──┐
  WP2 (timeouts)            ─┼─> safe for concurrent testers
  WP5 (CI gate)            ──┘
  Independent, any order: WP3, WP4, WP6 ──> WP7, WP8 ──> your VM run

Track B (Solidity) — critical path to the on-chain demo:
  SC1 (indexed-user event) ──> SC2 (test + Slither green) ──┐
                               SC3 (fund emissions, if yield)─┼─> SC4 (deploy Base Sepolia) ──> web overlay
                                                              ┘

Convergence: WP8 (GPU/AI up) + SC4 (contracts live) + WP7 (runbook) ──> M0.9 operator rehearsal
```

The two tracks are independent until the end — Track A touches `src/`/`app/`, Track B touches `contracts/`. You (or two sessions) can run them in parallel. Within Track A, WP1 lands first (riskiest, touches the ledger others read). Within Track B, SC1 must precede SC2/SC4 so the event change is in the deployed bytecode (avoids a redeploy). SC4 is last and is operator-run.

---

## 4. Track A — non-Solidity work packages

Each package: **Goal · Files · Steps · Acceptance · Effort/Risk · Model · Kickoff prompt.**

---

### WP1 — Ledger durability fix + regression tests

**Goal:** the credit/account ledger must never silently lose records under concurrency, and never overwrite a good file with empty data after a corrupt/partial read. (Audit findings B1 + B2, both reproduced by execution.)

**Files:** `src/lib/fishLedger.ts`, `src/lib/fishLedger.test.ts` (extend). Reference the correct pattern already in-repo: `src/lib/fishQuota.ts:96-101` (tmp-file + `rename` under a lock dir).

**Steps (tests first, then fix — TDD):**
1. **Reproduce (red):** add regression tests to `fishLedger.test.ts`:
   - 10 parallel `createApiKey()` calls → assert all 10 persist in `accounts.json` (today: only 1 survives).
   - Concurrent `addFishCredits` to two different accounts → assert both balances persist.
   - Corrupt `accounts.json` (write `"{ not json"`), then run any mutator → assert it errors loudly and the file is **not** replaced with empty (today: silent wipe).
2. **Lock the unlocked writers:** wrap `createApiKey` (`fishLedger.ts:480`), `getOrCreateGuestAccount` (`:523`), `addFishCredits` (`:682`), `activateFishSubscription` (`:746`) in `withFishLedgerLock(...)`, moving the `readLedger()` call **inside** the lock so the snapshot can't go stale. (The spend path already does this — copy its shape from `reserveFishCredits:862`.)
3. **Union, don't overwrite:** in `writeLedger` (`:1464`) build the merged ledger from `currentLedger.accounts` first (keyed by `id`), then apply the caller's accounts on top — so accounts another writer added aren't dropped. Keep the existing `preserveCurrentRevocation` behavior.
4. **Atomic writes:** add a `writeJsonAtomic(path, data)` helper (tmp in the same dir + `rename`); use it for `accounts.json` (`:1449,1473`), `credit_entries.json` (`:1506`), and receipts (`:1660`).
5. **Corrupt ≠ absent:** in `readLedger` (`:1430`) and `readCreditLedger` (`:1499`), only treat `ENOENT` as "empty"; on a JSON parse error, throw (and log) instead of returning `{accounts: []}`.

**Acceptance:**
- New tests fail on `main`, pass after the fix.
- `npm run test:app` green; `npm run verify` green.
- Manual: 10 concurrent creates → 10 persisted; corrupt file → mutator errors, file bytes unchanged.

**Effort:** L · **Risk:** Med (touches the money ledger — that's why the tests come first). **Model:** Fable 5.

**Gotchas:** don't widen the lock around outbound backend calls (would serialize all inference). Keep `appendCreditEntries` inside the same lock so balance and receipt can't diverge. Tmp file must be in the same dir as the target or `rename` isn't atomic across Docker volume boundaries.

**Kickoff prompt:**
> Implement WP1 from `PHASE_1_WORK_PACKAGES.md`: ledger durability fix + regression tests in `src/lib/fishLedger.ts` and `src/lib/fishLedger.test.ts`. Work test-first: add regression tests that reproduce the concurrent-create lost-update and the corrupt-file silent-wipe, confirm they fail, then fix by (1) wrapping `createApiKey`, `getOrCreateGuestAccount`, `addFishCredits`, `activateFishSubscription` in `withFishLedgerLock` with the read inside the lock, (2) making `writeLedger` union with the current file by account id instead of overwriting, (3) adding atomic tmp+rename writes (copy the pattern from `fishQuota.ts:96-101`) for accounts/credit-entries/receipts, (4) making `readLedger`/`readCreditLedger` treat only ENOENT as empty and throw on corrupt JSON. Don't touch unrelated code. Finish with `npm run verify` green and show me the new tests failing-before / passing-after.

---

### WP2 — Outbound timeouts on chat paths

**Goal:** no outbound AI call can hang forever and strand the request while holding a credit reservation + concurrency slot. (Audit B3.)

**Files:** `src/lib/externalChat.ts` (the `fetch` ~line 58 has no signal), `src/lib/openAiCompatibleChat.ts:87` (timeout only applied if `timeoutMs` passed), `src/lib/fishChatGateway.ts` (callers don't pass `timeoutMs`). Add a `FISH_CHAT_TIMEOUT_MS` env (default e.g. 60000).

**Steps:**
1. Add `signal: AbortSignal.timeout(timeoutMs)` to the `externalChat` fetch, defaulting from `FISH_CHAT_TIMEOUT_MS`.
2. In `fishChatGateway.ts`, pass `timeoutMs` in the `routeContext` for the warm (`ocean-demo-vllm`) and `ocean-provider` calls so `openAiCompatibleChat` actually arms its timeout.
3. On timeout (`AbortError`/`TimeoutError`), ensure the existing error path releases the credit reservation and concurrency slot (it should already, via `releaseReservationAndReturn` — just confirm the timeout error is caught there).

**Acceptance:** a stubbed slow backend → request returns a timeout error within the configured window; reservation released, concurrency slot freed (assert via a small test or the existing gateway error path). `npm run verify` green.

**Effort:** S · **Risk:** Low. **Model:** Fable 5.

**Kickoff prompt:**
> Implement WP2 from `PHASE_1_WORK_PACKAGES.md`: add outbound timeouts to the chat paths. Add a `FISH_CHAT_TIMEOUT_MS` env (default 60000), apply `AbortSignal.timeout` to the `externalChat.ts` fetch, and pass `timeoutMs` from `fishChatGateway.ts` into `openAiCompatibleChat` for the warm and ocean-provider routes. Confirm the timeout error path releases the credit reservation and concurrency slot. Add a focused test if practical. Don't touch unrelated code; finish with `npm run verify` green.

---

### WP3 — Boot-time env validation

**Goal:** missing/invalid required production env fails fast at startup with a clear message, instead of surfacing as scattered runtime 503s. (Audit S4.)

**Files:** new `src/lib/env.ts` (zod schema) + a single import point that runs at boot (e.g. Next `instrumentation.ts` or a module imported by `app/layout.tsx`). There are ~109 `process.env.*` reads; you don't need all of them — validate the ones that are *required in production*.

**Steps:**
1. Create `src/lib/env.ts` with a zod schema covering at least: `FISH_GUEST_ID_SALT` (required in prod — guest routes fail closed without it), `FISH_ADMIN_TOKEN` (required in prod for admin routes), and the Stripe pair (`FISH_STRIPE_SECRET_KEY` + `FISH_STRIPE_WEBHOOK_SECRET`) **only if** billing is enabled. Make rules conditional on `NODE_ENV==='production'`.
2. Export a `validateEnv()` that throws a single aggregated, human-readable error listing everything missing.
3. Call it once at boot; in development, warn rather than throw.

**Acceptance:** in a prod-like env with a required var missing, the app refuses to boot with a clear list; dev is unaffected. `npm run verify` green.

**Effort:** S–M · **Risk:** Low. **Model:** Fable 5.

**Gotcha:** don't make every one of the 109 vars required — only the ones whose absence is a genuine prod safety/correctness issue. Grep `process.env` and use judgment; over-strict validation will block legitimate partial configs.

**Kickoff prompt:**
> Implement WP3 from `PHASE_1_WORK_PACKAGES.md`: boot-time env validation. Create `src/lib/env.ts` with a zod schema that validates production-required env (`FISH_GUEST_ID_SALT`, `FISH_ADMIN_TOKEN`, and the Stripe pair only when billing is enabled), conditional on `NODE_ENV==='production'`. Export `validateEnv()` that throws one aggregated readable error, and wire it to run once at boot (instrumentation or layout import), warning instead of throwing in dev. Grep `process.env` first to choose the right required set — don't over-require. Finish with `npm run verify` green.

---

### WP4 — Delete dead code

**Goal:** remove unimported reference code that inflates the tree and confuses readers. (Owner-approved.)

**Files:** delete `backend/` (Python, 16 KB — `server.py`, `ocean_supply.py`) and `legacy/` (2.6 MB, mostly a PNG). Update references in `README.md`, `AGENTS.md`, and `TECHNICAL_ARCHITECTURE.md` that point at them as "reference."

**Steps:**
1. Confirm no imports (already verified: nothing in `app/`/`src/` references them) — re-confirm with a grep.
2. `git rm -r backend legacy`.
3. Update docs that mention them (`AGENTS.md:68`, the README repo-structure section, `TECHNICAL_ARCHITECTURE.md:100`) to drop the "reference implementation" lines.

**Acceptance:** dirs gone; `npm run verify` green; no doc references a deleted path.

**Effort:** S · **Risk:** Low. **Model:** Fable 5.

**Kickoff prompt:**
> Implement WP4 from `PHASE_1_WORK_PACKAGES.md`: delete the dead `backend/` and `legacy/` directories. First grep to re-confirm nothing in `app/` or `src/` imports them, then `git rm -r` both and update any doc references (`AGENTS.md`, `README.md`, `TECHNICAL_ARCHITECTURE.md`) that describe them as reference code. Finish with `npm run verify` green.

---

### WP5 — CI workflow

**Goal:** every PR runs the checks `AGENTS.md` already mandates, and `main` is protected. (Audit O1.) Writing the YAML is non-Solidity work; the contracts job just *invokes* the existing Solidity test script.

**Files:** new `.github/workflows/ci.yml`.

**Steps:**
1. App job (Node 22): `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test:app` → `npm run build`. (That's `npm run verify` + build, or just call `npm run verify`.)
2. Contracts job: `npm --prefix contracts ci` → `npm run contracts:test`. Allow it to be a separate job so an app-only PR isn't blocked by Solidity toolchain time. (This job compiles Solidity — the only place Solidity enters Phase 1 CI; the YAML itself is plain config.)
3. Trigger on `pull_request` and pushes to `main`. After merge, enable branch protection requiring the app job.

**Acceptance:** workflow runs on a test PR and fails on a deliberately introduced lint/test error. `npm run verify` still green locally.

**Effort:** S · **Risk:** Low. **Model:** Fable 5.

**Gotcha:** the `build` step needs Next to build without live secrets — make sure no build-time code requires real env (relates to WP3; keep `validateEnv` from hard-failing the build, or provide CI dummy env).

**Kickoff prompt:**
> Implement WP5 from `PHASE_1_WORK_PACKAGES.md`: add `.github/workflows/ci.yml` with two jobs on Node 22 — an app job running `npm ci` then `npm run verify` then `npm run build`, and a separate contracts job running `npm --prefix contracts ci` then `npm run contracts:test`. Trigger on pull_request and pushes to main. Make sure the build step doesn't require real secrets. Don't change app code. Show me the workflow and explain how to enable branch protection.

---

### WP6 — "Hold your FISH to reclaim OCEAN" UI/copy

**Goal:** make explicit, in the staking UI, that reclaiming locked OCEAN requires holding the minted FISH and calling burn — so testers don't transfer FISH away and strand their OCEAN. (Audit CC-3.)

**Files:** the credits/staking UI — `src/components/EvmContractActionPanel.tsx` (mint/burn FISH actions), possibly `src/components/StakingCreditsPanel.tsx`, and the `/credits` page (`app/credits/page.tsx`). Keep copy aligned with `CONTENT_COPY.md` voice.

**Steps:**
1. Find the mint-FISH and burn-FISH action UI in `EvmContractActionPanel.tsx`.
2. Add a short, plain-language note near those actions: locking OCEAN to mint FISH means you must keep that FISH to later burn it and unlock your OCEAN; transferring the FISH away strands the locked OCEAN.
3. Match the Fish/Ocean Navy voice; accessible HTML (not an image).

**Acceptance:** the note renders near the mint/burn actions on `/credits`; copy reviewed against `CONTENT_COPY.md`. `npm run verify` green.

**Effort:** S · **Risk:** Low. **Model:** Fable 5.

**Kickoff prompt:**
> Implement WP6 from `PHASE_1_WORK_PACKAGES.md`: add clear UI copy near the mint-FISH / burn-FISH actions (in `src/components/EvmContractActionPanel.tsx` and the `/credits` page) explaining that reclaiming locked OCEAN requires holding the minted FISH to burn it, and that transferring the FISH away strands the OCEAN. Keep it accessible HTML and aligned with `CONTENT_COPY.md` voice. Finish with `npm run verify` green.

---

### WP7 — Phase-1 operator runbook

**Goal:** write down the Option A seam mechanics so an operator can drive the end-to-end demo reliably and the M0.9 rehearsal is repeatable. (Audit §7-A0.)

**Files:** new `docs/phase1-operator-runbook.md`.

**Steps:** document the two operator seams using existing endpoints:
1. **Stake → credits:** verify the tester's on-chain stake/mint on Sepolia Basescan (address, amount, confirmations), then `POST /api/staking/positions` with `x-fish-admin-token` and the verified amount; hand the returned one-time API key to the tester.
2. **Usage → settlement:** read summed provider cost (`/api/usage/summary`), then `POST /api/proof/capacity-settlements` with `submitOnchain: true` and a unique `idempotencyKey`; tester then claims USDC on `/credits`.
3. Include the honesty rule (copy says "operator-verified," not "automated"), admin-token hygiene, and a step-by-step M0.9 rehearsal checklist.

**Acceptance:** a colleague can run the full loop from the doc alone. (Doc-only; no code change.)

**Effort:** S · **Risk:** Low. **Model:** Fable 5.

**Kickoff prompt:**
> Implement WP7 from `PHASE_1_WORK_PACKAGES.md`: write `docs/phase1-operator-runbook.md` covering the Option A seam mechanics from `AUDIT_REPORT.md` §7-A0 — the stake→credits step (`/api/staking/positions`) and usage→settlement step (`/api/proof/capacity-settlements` with `submitOnchain`), plus admin-token hygiene, the "operator-verified" honesty rule, and a step-by-step M0.9 rehearsal checklist. Ground every endpoint and field in the real routes. Doc only.

---

### WP8 — GPU/AI backend prep

**Goal:** prepare everything needed to point the app at a real warm inference backend, so "use AI" is real (not mock), leaving only the actual VM run to you. (Audit §7-A / M0.6.)

**Files:** an env overlay template (e.g. `.env.ocean-demo-stack.example` is already present — produce a filled-in template + a checklist doc, `docs/phase1-gpu-backend.md`). No app code change expected; verify the route code path reads the right vars.

**Steps:**
1. Document the rented-VM checklist: NVIDIA GPU sizing for the default `Qwen/Qwen3-8B` (~16 GB) or the `deploy/warm-inference/env.qwen3-14b-l40s.example` profile; NVIDIA Container Toolkit; `make ocean-demo-up-warm`.
2. Produce the web-app env overlay: `FISH_CHAT_ROUTE=ocean-demo-vllm`, `FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<vm>:8088/v1` (the signing runner, not raw vLLM), `FISH_OCEAN_DEMO_VLLM_API_KEY`, `FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat`. Reference `npm run ocean-demo:web-env`.
3. Verify (read-only) that `src/lib/fishRouter.ts` + `src/lib/vllmChat.ts` consume those vars and that a configured warm route reports `ready`. Note the security reminders (bind private, don't expose vLLM publicly; pair with WP2 timeout).

**Acceptance:** a checklist + filled env template such that, given the VM, you can bring AI online and `/ask` returns `costState:"provider_verified"`. (Prep is here; the VM run is yours.)

**Effort:** S–M · **Risk:** Low. **Model:** Fable 5 (prep). VM run = your infrastructure.

**Kickoff prompt:**
> Implement WP8 from `PHASE_1_WORK_PACKAGES.md`: prepare the GPU/AI backend wiring. Write `docs/phase1-gpu-backend.md` with the rented-VM checklist (GPU sizing, NVIDIA toolkit, `make ocean-demo-up-warm`) and the web-app env overlay (`FISH_CHAT_ROUTE=ocean-demo-vllm`, `FISH_OCEAN_DEMO_VLLM_BASE_URL` pointing at the runner on :8088, API key, model). Verify read-only that `fishRouter.ts`/`vllmChat.ts` consume those vars and that a configured warm route reports ready. Don't change app code unless a var is genuinely misread. Note the private-binding and timeout (WP2) reminders.

---

## 5. Track B — Solidity work packages

Each package: **Goal · Files · Steps · Acceptance · Effort/Risk · Model · Kickoff prompt.** All Solidity is `0.8.26` + Hardhat; tests are `node:test`-style via `hardhat test`. **These need the Solidity toolchain (compiler download + an RPC) — they run on your machine, not the audit sandbox where the compiler download is blocked.**

---

### SC1 — Add `indexed user` to `FishMinted` / `FishBurned`

**Goal:** make the mint/burn events carry the user's address so the Phase-2 credit-issuance watcher can key on them directly, instead of fragile `tx.from` parsing. One line now (pre-deploy) versus a contract redeploy later. (Audit CC-6 / §7-B3.)

**Files:** `contracts/contracts/FishOceanStaking.sol` (declarations `:64-65`, emits `:235,257`), `contracts/test/fish-contracts.test.js:13` (the one assertion on `FishMinted`).

**Steps:**
1. Change the declarations to index the user:
   - `event FishMinted(address indexed user, uint256 sOceanLocked, uint256 fishMinted);`
   - `event FishBurned(address indexed user, uint256 sOceanUnlocked, uint256 fishBurned);`
2. Update the emits to include `msg.sender` (both `mintFish`/`burnFish` are called directly by the user, so `msg.sender` is the minter/burner):
   - `:235` → `emit FishMinted(msg.sender, sOceanAmountToLock, fishAmountOut);`
   - `:257` → `emit FishBurned(msg.sender, sOceanToUnlock, fishAmountToBurn);`
3. Update the test at `fish-contracts.test.js:13` — keep `.to.emit(staking, "FishMinted")`, optionally add `.withArgs(user.address, ...)`.
4. Recompile and run the full suite (`npm --prefix contracts test`).

**Acceptance:** suite green; the compiled ABI for `FishMinted`/`FishBurned` now includes an indexed `user`. **Storage layout is unaffected** (events don't occupy storage slots), so the UUPS contract's layout discipline is preserved — and it's a fresh testnet deploy regardless.

**Effort:** S · **Risk:** Med (it's a contract source edit). **Model:** Fable 5.

**Gotcha:** change *both* events for consistency even though only `FishMinted` is strictly needed by the bridge. Re-run the **invariant** suite too (`npm run contracts:test`), not just the unit test, to be safe.

**Kickoff prompt:**
> Implement SC1 from `PHASE_1_WORK_PACKAGES.md`: add `address indexed user` as the first parameter of the `FishMinted` and `FishBurned` events in `contracts/contracts/FishOceanStaking.sol` (declarations at lines 64-65), and pass `msg.sender` at the emit sites (lines 235 and 257). Update the event assertion in `contracts/test/fish-contracts.test.js:13`. Recompile and run `npm --prefix contracts test` (unit + invariants) until green. Confirm storage layout is unaffected. Don't change any other contract behavior.

---

### SC2 — Run `contracts:test` + `contracts:security`, fix findings

**Goal:** get the contract suite and Slither static analysis green locally before deploy. I verified the tests *by reading* them but could not execute them here (the Solidity compiler download is network-blocked in the audit sandbox) — this package is that missing execution. (Audit CC-6.)

**Files:** `contracts/**` (run; fix only real findings).

**Steps:**
1. `npm --prefix contracts ci` (install the contracts workspace).
2. `npm run contracts:test` — runs both `fish-contracts.test.js` and `fish-contract-invariants.test.js`.
3. `npm run contracts:security` (compile + test + Slither via `scripts/run-static-analysis.js`), or `npm run contracts:security:docker` to run Slither in Docker.
4. Triage Slither output: fix genuine issues; for accepted false positives, use the existing `slither-disable` annotation style already in the contracts. Re-run until clean (or `:strict` if you want zero-tolerance).

**Acceptance:** `contracts:test` and `contracts:security` both pass; no unaddressed high/medium Slither findings.

**Effort:** S–M · **Risk:** Low (verification; fixes only if something's actually wrong). **Model:** Fable 5.

**Note:** must run where the Solidity compiler can be fetched (your machine / normal CI), not the restricted audit sandbox.

**Kickoff prompt:**
> Implement SC2 from `PHASE_1_WORK_PACKAGES.md`: run `npm --prefix contracts ci`, then `npm run contracts:test` and `npm run contracts:security`. Report results. Triage any Slither findings — fix real ones, annotate accepted false positives in the existing `slither-disable` style — and re-run until green. Don't change contract behavior beyond what a finding requires; explain anything you change.

---

### SC3 — Emission-funding path (so staking shows rewards)

**Goal:** make staking rewards non-zero for the demo. Today `deploy-testnet.js` sets neither the emission rate nor funds the reserve, so `pendingRewards`/`claim()` return **0** by default. (Audit CC-1.)

**Files:** `contracts/scripts/deploy-testnet.js` (extend behind a flag), or a new `contracts/scripts/fund-emissions.js`.

**Steps:**
1. Add an **opt-in**, flag-gated block (e.g. `FISH_TESTNET_FUND_EMISSIONS=true`) that, after deploy: calls `setEmissionRate(rate)` (onlyOwner), `approve`s OCEAN from the **emission source** to the staking contract, then calls `fundEmissions(amount)`. Use small testnet values.
2. Keep it opt-in so a "no-yield" deploy stays zero by design — consistent with the "never claim guaranteed yield" invariant.
3. Print the resulting `emissionReserve` and rate in the deploy summary.

**Acceptance:** with the flag on, a smoke shows `pendingRewards` growing over time and `claim()` paying OCEAN; with the flag off, rewards stay zero. Both paths covered by a test or a scripted smoke.

**Effort:** S · **Risk:** Low–Med (touches the reward loop). **Model:** Fable 5.

**Gotcha:** `fundEmissions` is callable **only by the configured `emissionSource`** (`FishOceanStaking.sol:129-137`) — make sure the funding signer *is* that address, and `approve` before `fundEmissions`. The deploy script defaults `emissionSource` to the deployer, so funding from the deployer works unless you set a different source.

**Kickoff prompt:**
> Implement SC3 from `PHASE_1_WORK_PACKAGES.md`: add an opt-in `FISH_TESTNET_FUND_EMISSIONS` path to `contracts/scripts/deploy-testnet.js` (or a new `fund-emissions.js`) that calls `setEmissionRate`, approves OCEAN from the emission source, and calls `fundEmissions` with small testnet values, printing the resulting reserve/rate. Keep it opt-in so unfunded deploys stay zero by design. Add a scripted smoke or test proving funded→non-zero `pendingRewards` and unfunded→zero. Mind that `fundEmissions` is onlyEmissionSource and needs an approve first.

---

### SC4 — Deploy to Base Sepolia + generate web overlay (you run; Fable 5 prepares & verifies)

**Goal:** put the contracts live on Base Sepolia and wire the web app to read them. (Audit M0.4 deploy half.)

**Files:** runs `contracts/scripts/deploy-testnet.js` (via `npm run contracts:deploy:testnet`), then `npm run secrets:public-testnet`.

**Steps:**
1. In **your** shell, set `BASE_SEPOLIA_RPC_URL` and `FISH_CONTRACT_DEPLOYER_PRIVATE_KEY` (your key — never paste it to an agent).
2. `npm run contracts:deploy:testnet` → deploys, grants the minter role, configures the mint curve, and writes `contracts/deployments/<base-sepolia>.local.json`.
3. `npm run secrets:public-testnet -- --contract-deployment contracts/deployments/<artifact>.local.json --include-wallets --include-faucet` → generates the private web-app env overlay (only enables actions/faucet when the artifact is Base Sepolia, `chainId=84532`).
4. Sanity-check `GET /api/contracts/status` reads live totals from the deployed contracts.

**Acceptance:** contracts live on Base Sepolia; `/api/contracts/status` shows live reads; deploy artifact saved; web overlay generated.

**Effort:** S (mostly running) · **Risk:** Med (real keys, on-chain). **Model:** **you execute** (you hold the deployer key); Fable 5 prepares the exact commands and verifies the output/artifact. This follows the rule that an agent should never be handed a private key or run a deploy on your behalf.

**Depends on:** SC1 (event change must be in the deployed bytecode), SC2 (green), SC3 (if showing yield).

**Kickoff prompt (preparation/verification only):**
> Help me with SC4 from `PHASE_1_WORK_PACKAGES.md`: walk me through deploying to Base Sepolia. Give me the exact env vars and commands to run (`contracts:deploy:testnet`, then `secrets:public-testnet` with the deployment artifact), tell me what good output looks like, and after I paste back the deploy summary, verify the addresses/artifact and confirm `/api/contracts/status` should read live. Do not ask for my private key and do not run the deploy yourself — I'll execute it.

---

### Track B notes — optional & deferred (not scheduled for Phase 1)

- **SC5 (optional, Low):** zero-staker settlement guard — make `recordPaidUsage` revert when `totalStaked == 0` instead of letting net USDC become owner-sweepable orphan funds (`FishCapacityPool.sol:312`, audit CC-5). Small contract edit; or just operationally avoid recording usage before there are stakers. Include only if you want the guard in-contract for the demo.
- **SC6 (DEFERRED to the production gate — NOT Phase 1):** add `nonReentrant` to `FishOceanStaking`'s six mutators (`stake/initiateUnstake/finalizeUnstake/claim/mintFish/burnFish`) + commission an external audit (audit CC-2). Safe to skip for testnet (CEI is followed, tokens are trusted); this is the owner's "production comes after testnet" item. Listed so it isn't forgotten.

---

## 6. Phase 1 — definition of done

**Track A (non-Solidity):**
- WP1: concurrent-create and corrupt-file regression tests pass; no silent ledger loss.
- WP2: outbound chat calls time out; reservation + concurrency slot released on timeout.
- WP3: production boot fails fast on missing required env; dev unaffected.
- WP4: `backend/` and `legacy/` gone; docs updated; `verify` green.
- WP5: CI runs `verify` (+ contracts) on every PR; `main` protected.
- WP6: FISH-unlock rule visible in the staking UI.
- WP7: operator runbook complete and rehearsable.
- WP8: GPU backend env template + checklist ready for your VM run.

**Track B (Solidity):**
- SC1: `FishMinted`/`FishBurned` carry an indexed `user`; suite green; storage layout unchanged.
- SC2: `contracts:test` + `contracts:security` (Slither) pass; no unaddressed high/medium findings.
- SC3: funded deploy → non-zero `pendingRewards`; unfunded → zero (both verified).
- SC4: contracts live on Base Sepolia; `/api/contracts/status` reads live; web overlay generated.

When both tracks are done, Phase 1's code/contract work is complete. What remains is **operational, not a code package**: you run the GPU VM (WP8 preps it) and you drive the **M0.9 operator rehearsal** (WP7 is its runbook) — the single unbroken run that gates Phase 2. All of it is tracked in `AUDIT_REPORT.md` §7.

## 7. Pointers

- Full audit + severities: `AUDIT_REPORT.md` §3.
- Phased plan + the two automation bridges (Phase 2): `AUDIT_REPORT.md` §7 (Workstreams B + C).
- Deferred items (scale, DB abstraction, contract hardening): `AUDIT_REPORT.md` §1a table.
