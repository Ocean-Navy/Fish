# UX Simplification Plan — "Venice-simple, Fish-fun"

> **STATUS: Phases 1 + 2 implemented and live-verified** (branch `fix/ui-ux-gaps`). The landing hero is a real "Ask Fish anything..." input — type, press Enter, and `/ask?q=` auto-runs the question (verified end to end against the live MLX route: landing → typed question → real answer, one page hop, zero forced choices). `/ask` is order-first with the dish grid collapsed to chips ("Full menu with pictures" disclosure keeps the art), and model picker/API key/route links live behind the new persistent **Advanced mode** toggle (`AdvancedMode.tsx`). `/credits` leads with "Three ways to get credits" and gates contract controls/records behind Advanced. Nav diet everywhere: Ask Fish · Credits · Proof · More ▾. The four doors + labeled maps moved to the new `/story` page; the landing flow is 3 steps with a "full story" link. `/routing` shows the active route + a 4-tier privacy story in simple mode (8-mode grid + caps matrix behind Advanced). `/api` page merged into `/docs` (endpoint board behind Advanced; `/api` redirects). Landing sections 7→6 with single-CTA discipline; tests/tsc/eslint green.
>
> **Phase 3 remaining:** multi-turn chat needs a backend decision first — the dish-run route accepts a single `prompt` (server-side prompt wrapping), so conversation history requires either extending that schema or routing guests through `/v1/chat/completions`-style messages with quota implications. Deliberately not bolted on client-side. The "real Pricing page" stays parked until billing goes live (honesty rule). Mobile: menus, chip wrapping, and full-width hero input verified; a device-level polish pass remains worthwhile before the public demo.

*Benchmark: venice.ai (the stated competition). Goal: a first-time visitor gets a real AI answer as fast as on Venice, the restaurant/Venice-harbor theme stays, and everything operational or protocol-deep moves behind an explicit **Advanced** mode.*

## 1. What Venice does that we should steal

Venice's landing page IS the product: the hero is a single live input ("Ask anything"), nav is four items (About, Features, Pricing, Log in), and every section below has exactly one job and one CTA — capability sections even embed a mini demo with a single "Chat Now" button. Pricing is three tiers with plain bullets ("Simple pricing. No surprises."). Privacy is four tiers, one line each. Nothing asks the visitor to learn vocabulary before using the product.

What we deliberately do NOT copy: their visual blandness. Fish's Venice-harbor art and restaurant language are a real differentiator — the plan keeps the theme and cuts the *quantity*, not the personality.

## 2. Where Fish stands today (measured on the dev build)

| Surface | Today | Venice equivalent | Target (simple mode) |
|---|---|---|---|
| Landing | 49 interactive elements, 7 sections, 13 above the fold; hero "input" is a fake (a link) | 1 live input + 4 nav links | ≤ 15 elements, 4 sections; hero input is REAL |
| Time to first answer | 2 page loads + 2 clicks + typing (land → /ask → pick → type → submit) | type + Enter on the landing | type + Enter on the landing |
| /ask | 24 elements, 12 above fold (dish grid, model picker, key field, 3 link cards, 2 disclosures) | input + send (+ model picker) | ≤ 8 above fold |
| /credits | 53 elements, 919 words, 8 panels (steps, cards, guardrails, faucet, contracts, intents, token notes) | 3 pricing cards + bullets | 3 choices + faucet; rest behind Advanced |
| Metaphor layers shown at once | dishes + doors + boats + vault + maps + harbor | one ("private AI") | one per page |

## 3. The one structural idea: Simple by default, Advanced by choice

A single `fish-ui-mode` flag (localStorage, same pattern as the dish/model persistence) with a small toggle in the header area: **"Advanced mode"** (off by default). Simple mode hides operational/protocol detail; Advanced mode is exactly today's UI. Nothing is deleted — power users and the operator lose nothing. One component (`AdvancedOnly`) gates the extras so the diff stays small.

## 4. Page-by-page

### 4.1 Landing (`/`)

- **Hero input becomes real.** Type a question, press Enter → navigate to `/ask?q=...` which auto-runs Quick Catch on arrival. The dolphin chef stays; the question goes straight to the kitchen. (This is the single highest-impact change on the list.)
- Keep one secondary CTA ("Explore the market"); drop the second row of buttons.
- Section diet (7 → 4): keep **hero**, **one capability section** (the five dishes as cards, Venice-style, each with one CTA into `/ask` with that dish pre-selected), **one "how it works"** (3 steps: Ask → Credits → Providers get paid), **pilot form + footer**.
- Move out: the four market-entrance doors and the two big labeled maps go to a new `/story` page (linked "The full story" from the how-it-works section, and from More in the nav). The art is excellent — it deserves its own page instead of stretching the landing.
- Nav diet: `Ask Fish · Credits · Proof · More ▾` (More: Story, Dashboard, Providers, API, Docs, Roadmap, Support, Data policy). Seven inline links → three + More.

### 4.2 Ask (`/ask`)

- **Order-first layout.** The right panel (prompt → button → answer) becomes the page's first column; auto-focus the textarea; Enter submits (Shift+Enter for newline). Support `?q=` for the landing handoff.
- **Dish grid shrinks to a chip row** (Quick Catch active by default, the other four as small chips, "More dishes" opens the full illustrated menu as a sheet/disclosure). The big dish art moves into the order panel header only (already there).
- **Advanced disclosure swallows:** model selector, API key field, the three link cards (Data policy / API docs / Proof), and "How this order is handled". In Advanced mode they're always visible, as today.
- Receipt: show a one-line summary under the answer — `1 credit · Ocean demo vLLM · receipt verified ✓` — with the full receipt behind the existing expander. (The trust signal stays visible; the table stays optional.)
- The route badge stays in both modes (honesty rule) — it is one chip and it now reflects real health.

### 4.3 Credits (`/credits`)

- Simple mode = **"Three ways to get credits"**: Free taste (faucet panel), Stake OCEAN (stake intent + the hold-your-FISH note), Top up (card/USDC when enabled) — plus the credit-rule note. Target ≤ 20 interactive elements.
- Advanced mode adds: contract action panels (mint/burn/capacity batches), contract address list, batch/flush controls, token-guardrail cards, the full staking summary table. (Testers doing the M0.9 rehearsal flip Advanced on — the runbook can say so.)
- The WP6 "hold your FISH" warnings stay in BOTH modes wherever mint/burn actions are visible.

### 4.4 Routing, API, Docs, Proof

- `/routing` simple mode: the active-route card + the four-line privacy story (mirror Venice's privacy tiers: Demo → Warm Ocean demo → Selected providers → Private later, one line each). The 8-mode grid and feature-cap matrix move behind Advanced.
- `/api` + `/docs`: merge into one `/docs` page (they overlap heavily today); endpoint board goes behind Advanced; keep "get a key from your pilot invite" + one curl example up front.
- `/proof` is already well-layered (hero verdict → cards → "Open the proof ledger" disclosure) — only change: simple mode collapses the builder-details section by default (it already is a `<details>`; just keep it that way and resist adding more top-level panels).
- `/dashboard` is a builder surface: link it under More; no simple-mode work needed.

### 4.5 Copy rules (both modes)

- **Dishes sell; receipts reassure.** People come to a market for the food, not the paperwork. User-facing simple surfaces lead with appetite — answers, speed, dishes, privacy as a benefit. Receipts and proof appear at the right moment (the bill after the meal, the receipt expander under the answer) and headline only where trust IS the product: `/proof`, the dashboard, provider/holder/operator surfaces, and Advanced mode. Owner-set principle; applied to the landing flow section, the skeptic section ("Don't take our word for it"), and the `/story` hero.

- One metaphor layer per page: dishes on /ask, vault on /credits, harbor on /proof. Doors/boats/maps live on /story.
- First use of a protocol term in simple mode gets a plain-language gloss or is omitted: "sOCEAN" → "your staked OCEAN", "runner receipt" → "signed kitchen receipt".
- Every section: one heading, one job, one CTA (Venice discipline).
- Keep the honesty labels everywhere ("operator-verified", route badges, prototype estimate) — simplicity must never mean vaguer claims.

## 5. Phasing

- **Phase 1 (one session, no IA changes):** live hero input + `?q=` auto-run; /ask order-first + chip row + Advanced disclosure; Advanced-mode toggle + `AdvancedOnly` gate; /credits simple grouping. Measurable: time-to-first-answer = type+Enter on landing; /ask ≤ 8 above-fold elements in simple mode.
- **Phase 2 (IA):** /story page (move doors + maps), nav More-menu, /api+/docs merge, /routing privacy-tier rewrite.
- **Phase 3 (later):** multi-turn chat on /ask (Venice parity for conversation), mobile polish pass, real "Pricing" page when billing goes live.

## 6. What we explicitly keep

The dolphin chef, the dish names, the Venice-harbor art (now WebP), the playful section titles, the proof-first honesty system, and every Advanced capability that exists today — just one toggle away instead of all on the table at once.
