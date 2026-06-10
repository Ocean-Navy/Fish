# UI/UX Gap Report — full app walkthrough

> **STATUS: ALL 25 FINDINGS FIXED** on branch `fix/ui-ux-gaps` (commits `28ecf534` P0, `84c7ae98` P1+P2). Re-verified live in the browser: friendly error copy renders for local validation and server 429s (title + plain body + code small-print + CTA), route badge/copy now reflect observed health (new `fishRouteHealth` fed by the gateway, surfaced in `/api/routing/policy`, the meal-counter badge, and the `/routing` hero), mobile nav `<details>` menus on all three full headers, hero/flow art converted to WebP (27 MB → 6.8 MB, no more blank heroes), forms fail safely with distinct error styling, admin-gated payout links replaced with operator-only labels, receipts show Kitchen public label + cost basis + signature state, guest receipts no longer show "Credits left: 0", account errors humanized + empty-key feedback, copy-key button on rotate, all `warnings[*]` rendered, faucet StatusBadge, busy states on Refresh/Connect, Tailwind `/82 /92 /18` → valid steps, a11y labels + skip link + role=alert/status, `/dashboard` metadata, `/chat` → `/ask` redirect, footer Support/Privacy/Refunds links, `next/link` in MarketEntrances, policy values labeled as configured, `FishChatPrototype` deleted + meal-order docs aligned, endpoint board hand-maintained caveat, superseded v4 PNG removed. Tests 44/44 files green (incl. new `fishErrorCopy` + `fishRouteHealth` suites), tsc clean, eslint clean. `next build` should be run once on the host (sandbox cannot execute SWC).

*Produced from (1) a live end-to-end browser session against `npm run dev` (every page, the guest chat flow, the account key flow, console + network monitoring) and (2) a full static scan of `app/` + `src/components/`. Tags: **[live]** = reproduced in the browser, **[code]** = verified at file:line. Severity: **P0** fix before public testers, **P1** fix during testnet, **P2** polish.*

## What already works well

Worth saying first: all 15 pages render with zero console errors; the visual identity is strong and consistent; data-state badges (live/snapshot/sample) appear on 13 dashboard/proof panels; the two tables-heavy pages scroll correctly; the API key is never persisted client-side; error boxes in the two main flows have `role="alert"`; the WP6 "Hold your FISH" notes render near mint/burn **[live]**; the contracts panel reads live Base Sepolia state (current batch 2) **[live]**; and a dead warm backend fails fast instead of hanging — WP2 working **[live]**.

## P0 — before opening the demo to the public

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| 1 | **Guest chat errors leak raw backend codes.** Asking a question with the warm route down shows a gray low-contrast box: "ocean demo vllm backend error". 429 quota/rate/budget errors and 503s (`fish_router_paused`, `guest_identity_salt_required`, ...) all render as de-underscored jargon with no guidance, no reset time, no CTA. The 402 path is the only humanized one. | [live] + [code] `FishMealCounter.tsx:195-204` | Map error families to plain language + action ("Fish is being set up / come back tomorrow / Get credits" link), style the box as an error, keep the code as small print. |
| 2 | **"Live AI" claimed while the backend is down.** `/ask` badge shows "Live AI" and `/routing` hero says "Ocean demo vLLM. Real AI today." while every request fails (upstream answered 405 — endpoint configured but wrong/half-up). Route status is derived from *config presence* (`fishRouter.ts` `configured`), never from health. | [live] | Feed last-request-failure or the `/models` probe into the public badge (amber "warm route unreachable"), and soften `/routing` hero copy when the route isn't verified healthy. Pairs with the operator runbook honesty rule. |
| 3 | **No mobile navigation.** All three headers (`app/page.tsx:38`, `RolePageShell.tsx:63`, `PublicProofPage.tsx:84`) are `hidden ... md:flex` with no hamburger — below 768px the only nav is logo + Join. 13 of 15 pages affected. | [code] | Add a small disclosure menu to the three headers. |
| 4 | **Hero images are 2.4–3 MB PNGs with optimization off.** `public/assets/generated/` totals **27 MB**; `images.unoptimized: true` (`next.config.ts`). Result observed even on localhost: hero panels render as empty dark boxes for seconds on `/credits`, `/providers`, `/support`, `/docs` before the art pops in. On 4G this is tens of seconds. | [live] + [code] | Convert generated art to WebP/AVIF at display size (`/support` already uses a .webp — precedent), or drop `unoptimized`. Add `priority` + blur placeholder to the hero image. |
| 5 | **Forms can hang forever on "Sending...".** `InterestForm.tsx:41-56` and `SupportTicketForm.tsx:32-46` have no try/catch around fetch — a network failure leaves the button stuck busy with no feedback. Also all non-OK statuses (429 rate limit, 500) show the *validation* message ("Please add a contact..."). | [code] | try/catch → failure copy; branch message on status. |
| 6 | **Public proof page links to admin-gated JSON.** "JSON" (`/api/proof/payouts?limit=50`) and "Export batch" links are admin-token-gated routes — public visitors in production get a 401 error page. (Returns 200 in dev because `requireAdmin` waives the gate without a token outside production — verified both ways.) | [code] `ProofSummaryPanel.tsx:97,126` + [live dev] | Render those links only in an operator context, or point at public summary endpoints. |

## P1 — during testnet

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| 7 | Invalid API key shows raw `invalid_api_key`; an empty key + "Refresh tab" does nothing at all (no request, no feedback). | [live] `FishAccountPanel.tsx:102-111` | Humanize the code map; disable button or show "paste a key first". |
| 8 | Guest receipts show "Credits left: 0" although guests run on daily quota — reads as "broke". | [code] `FishMealCounter.tsx:521` | Hide the credits row in guest mode. |
| 9 | Receipt shows a dollar price but never the `costState` (`prototype_estimate` arrives and is dropped; elsewhere relabeled to just "estimate", plan state "prototype" shown as "pilot"). Honesty-rule erosion. | [code] `FishMealCounter.tsx:324,517-569,694`; `FishAccountPanel.tsx:778-780`; `StakingCreditsPanel.tsx:92-94` | Show "prototype estimate" next to the price; keep the prototype qualifier in labels. |
| 10 | `TestnetFaucetPanel` fetches `dataState` but never renders a badge — the one panel without it. | [code] `TestnetFaucetPanel.tsx:9` | Add `<StatusBadge state={status.dataState} />`. |
| 11 | `/api` page promises "Create a pilot key — Issue a Fish key with starter credits" but key creation is admin-only in dev *and* prod; no self-serve UI exists. | [code] `app/api/page.tsx:14`, `app/v1/api_keys/route.ts:35-39` | Reword to "Get a key from your pilot invite" (or build the dev-only flow). |
| 12 | Homepage asserts "Providers get paid" (present tense) while the usage panel admits payouts are $0 until real jobs run. | [code] `app/page.tsx:23,104` vs `FishUsageSummary.tsx:75` | Soften to "Providers get paid from real usage (pilot)". |
| 13 | Tailwind opacity classes `/82`, `/92`, `/18` are silently dropped by Tailwind 3.4 (only steps of 5 exist) — the RolePageShell hero tint and dish-overlay borders fall back to defaults on every role page. | [code] `RolePageShell.tsx:88`, `FishMealCounter.tsx:426,490,614` | Change to `/80`, `/90`, `/20` or bracket values. |
| 14 | `PublicProofPage.tsx:324` renders `warnings[1]` only (skips `warnings[0]` — likely off-by-one); every other panel shows only `warnings[0]` and drops the rest. | [code] | Render all warnings (stack/join). |
| 15 | Dead code: `FishChatPrototype.tsx` (426 lines, only consumer of `/v1/chat/completions` UI-side) is imported nowhere; `/api/meal/order` endpoint has no UI consumer but is documented as backing the meal counter (README:21, openapi.yaml:286). | [code] | Delete or wire up; align docs with `/api/dishes/:id/run` reality. |
| 16 | Double-fire risks: dashboard Refresh not disabled while pending; wallet Connect has no busy state (two clicks = two wallet prompts). | [code] `DashboardPreview.tsx:53-60`, `EvmContractActionPanel.tsx:150-157` | Add disabled/busy gates. |
| 17 | Rotated API key is shown once in a bare readonly input — no copy button, no "save it now" emphasis before navigation. | [code] `FishAccountPanel.tsx:553-557` | Copy-to-clipboard + warning. |

## P2 — polish

| # | Finding | Evidence |
|---|---------|----------|
| 18 | A11y: `notes` textarea + 8 provider-detail inputs are placeholder-only (no labels); new-key input lacks aria-label; faucet StepCard state is color-only; stake-intent + contract-action error texts lack `role="alert"`; no skip-to-content link. | [code] `InterestForm.tsx:88-104`, `FishAccountPanel.tsx:556`, `TestnetFaucetPanel.tsx:355-364`, `EvmStakeIntentPanel.tsx:166`, `app/layout.tsx:22-26` |
| 19 | Success and error share identical gray styling in the two lead forms (`role="status"` for both). | [code] `InterestForm.tsx:120`, `SupportTicketForm.tsx:111` |
| 20 | `/dashboard` has no metadata export — browser tab shows the homepage title. `/ask` and `/chat` are identical pages with identical titles. | [live] + [code] `app/dashboard/page.tsx`, `app/ask|chat/page.tsx` |
| 21 | Proof "detail"/JSON links open raw API JSON in the tab with no human-readable view or "opens JSON" hint. | [code] `ProofSummaryPanel.tsx:108,157`, `BenchmarkMatrixPanel.tsx:103`, `PublicProofPage.tsx:264` |
| 22 | Footer carries only "Data policy" — no Support/Privacy/Refunds links anywhere in the footer; `MarketEntrances` uses raw `<a>` instead of `next/link` (full reloads). | [live] + [code] `MarketEntrances.tsx:151-152` |
| 23 | Dashboard KPI row `lg:grid-cols-7` is cramped at 1024px; "Fish-ready 0" KPI label is opaque to outsiders. | [live] + [code] `DashboardPreview.tsx:70` |
| 24 | Hardcoded figures presented as live: market-making "Target margin 35% / Reserve buffer 10%"; client-side credit formula in stake intent (panel does disclaim "Not issued"). | [code] `MarketMakingPanel.tsx:77`, `EvmStakeIntentPanel.tsx:31-38` |
| 25 | Leftovers: superseded `fish-money-flow-labeled-v4.png` still shipped (v5 in use); `/api` endpoint board states are hardcoded copy that can drift; account "0 uses" badge in empty state. | [code] `VisualExplainers.tsx:80`, `app/api/page.tsx:47-106`, `FishAccountPanel.tsx:485` |

## Local-env note (not a code gap)

Your dev machine has `FISH_CHAT_ROUTE=ocean-demo-vllm` with the MLX profile (`mlx-community/Llama-3.2-3B-Instruct-4bit`, provider `ocean-navy-local-mlx`), but the endpoint at the configured base URL answered **HTTP 405** — the MLX server/runner is either not running or the base URL is missing its `/v1`/wrong port. Until it's up (or `FISH_CHAT_ROUTE` is set back to `mock`), every `/ask` request fails — which is also why finding #2 is so visible. `npm run ocean-demo:web-env -- --profile mlx` regenerates a consistent overlay.

## Post-verification update (MLX warm route live)

With `mlx_lm.server` running, the full loop was re-verified in the browser: ask → real answer in ~0.4–2 s, `route: ocean-demo-vllm`, `costState: provider_verified`, `runnerSignatureState: verified`, credits debited (guest 25→23), receipt rendered, usage rollup live (38 ocean-native jobs, 5 runner-verified). Two receipt-UI confirmations for the list above: the receipt shows neither the cost state nor the verified-signature state (finding #9 — the strongest trust signal Fish has is computed and then not displayed), and "Kitchen: ocean demo vllm" prints the raw route id instead of the public label "Ocean demo vLLM".

## Suggested fixing order

1 → 2 → 5 (error UX trio: one afternoon, biggest tester-facing impact) → 4 (asset compression, mechanical) → 3 (mobile menu) → 6 (proof links) → P1 batch (7-17 are mostly one-liners) → P2 sweep.
