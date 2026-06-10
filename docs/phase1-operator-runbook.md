# Phase 1 — Operator Runbook (Option A seams, M0.5)

This is the script for the Phase-1 demo and the M0.9 rehearsal. In Phase 1 two links of the chain are **deliberately manual**: the operator is the bridge between on-chain events and the Fish app. Phase 2 (credit bridge + settlement reconciliation) replaces this person with code; until then, this runbook is the product.

**The honesty rule (applies to everything below):** demo copy, dashboards, and anything a tester sees say **"operator-verified" — never "automated."** The staking-credits path stamps records `sourceState: "live"` without doing on-chain checks itself (`src/lib/stakingCredits.ts`); that is acceptable in Phase 1 *only because the operator performs the verification by hand before issuing.* Issue only amounts you personally verified.

## 0. Prerequisites

- [ ] Contracts deployed to Base Sepolia (Track B / SC4); `GET /api/contracts/status` shows live reads and the expected addresses.
- [ ] Real AI online (WP8 / `docs/phase1-gpu-backend.md`): `GET /api/warm/status` → warm route `ready`/`active`.
- [ ] `FISH_ADMIN_TOKEN` set on the server: long, random, not a placeholder (placeholders are rejected in production — `requireAdmin`, `src/lib/fishLedger.ts`).
- [ ] Tester has a Base Sepolia wallet with gas; testnet OCEAN available via the faucet panel on `/credits`.
- [ ] A private channel to the tester (for handing over the one-time API key).

**Admin-token hygiene:** the token authorizes credit issuance and on-chain settlement. Use it only server-side or from your own terminal (`curl` below) — never from a browser console on the demo box, never in client code, never in screenshots/screen shares. Rotate it after each public session.

## 1. Seam 1 — Stake → credits

The tester stakes testOCEAN and mints FISH themselves from the `/credits` panel ("Catch FISH" group). The mint UI warns them to keep the FISH — transferring it away strands the locked OCEAN (WP6).

**1. Verify on Basescan (this step IS the product in Phase 1):**

- [ ] Open the tx the tester gives you on Sepolia Basescan (`https://sepolia.basescan.org/tx/<hash>`).
- [ ] Confirm: `from` = the tester's address, the `stake`/`mintFish` call targets **our** staking contract address (cross-check `GET /api/contracts/status`), the OCEAN amount matches what they claim, and the tx has ≥ 2 confirmations.

**2. Issue exactly the verified amount:**

```bash
curl -s -X POST "$FISH_BASE_URL/api/staking/positions" \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "holderLabel": "Rehearsal tester 1",
    "walletRef": "0x<verified tester address>",
    "oceanAmount": <verified OCEAN amount>,
    "lockDays": 30
  }'
```

Request fields (`parseStakingPositionRequest`, `src/lib/stakingCredits.ts`): `holderLabel` (optional, default "Ocean holder"), `walletRef` (required — use the verified address; stored only as a hash), `oceanAmount` (required, ≥ 1), `lockDays` (7–730, default 30), `budgetId` (default `pilot-credit-budget-v1`), `issueApiKey` (default `true`).

**3. Hand over the key.** The `201` response contains:

- `apiKey` — a **one-time Fish API key**; Fish stores only the hash (`keyNotice` says so). Send it to the tester over the private channel, then delete it from your side.
- `position.creditState` — `issued` is the happy path. `partial`/`queued` means the pilot credit budget (`FISH_STAKING_CREDIT_BUDGET`, default 10000) is short — top up the budget or say so honestly; don't promise queued credits.

Credits granted = `floor(oceanAmount × lockDays/30 × FISH_STAKING_CREDITS_PER_OCEAN_MONTH)` (default 0.1/OCEAN-month).

## 2. Seam 2 — Usage → settlement

After the tester has used real AI with their key (responses show `fish.costState: "provider_verified"`).

**1. Read the verified provider cost:**

```bash
curl -s "$FISH_BASE_URL/api/usage/summary"
```

Use `providerCostUsd` (summed from signed usage receipts) for the rehearsal segment. One settlement per segment — don't double-count usage already settled.

**2. Record the settlement on-chain:**

```bash
curl -s -X POST "$FISH_BASE_URL/api/proof/capacity-settlements" \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "grossUsdcAmount": <amount in USDC>,
    "settlementSource": "operator_adjustment",
    "paidDemandRef": "m09-rehearsal-segment-1",
    "idempotencyKey": "m09-2026-06-10-segment-1",
    "submitOnchain": true,
    "note": "M0.9 rehearsal settlement, operator-verified usage"
  }'
```

Rules enforced by the route (`src/lib/capacitySettlements.ts`):

- `idempotencyKey` (min 8 chars) is **required** when `submitOnchain: true`. Key it by date + segment (as above) so a retried curl is a no-op: a replay returns `200` with the original settlement instead of paying twice (`201` = newly recorded).
- The route approves USDC and calls `recordPaidUsage` on the capacity pool, then waits for confirmation — check the response: `submitState: "submitted"`, a `transactionHash`, and `onchainSubmission.confirmations ≥ 1`.
- A `502` `contract_settlement_error` means the on-chain call failed — fix the cause and retry with the **same** `idempotencyKey`.

**3. Tester claims USDC:** on `/credits` → "Serve capacity" group → **Claim USDC** (their wallet must hold staked capacity-pool FISH). Verify the claim tx on Basescan together — that's the demo's closing beat.

## 3. M0.9 rehearsal checklist (one unbroken run)

Gate for Phase 2. Run it end to end with a colleague as the tester; if any step needs an improvisation, fix the runbook and rerun.

- [ ] **Prep:** prerequisites above all green; `FISH_CHAT_ROUTE=ocean-demo-vllm`; faucet funded; admin token fresh.
- [ ] **1. Stake:** tester gets testnet OCEAN from the `/credits` faucet, approves + stakes, mints FISH ("Catch FISH" panel). UI shows the hold-your-FISH warning.
- [ ] **2. Verify + issue:** operator verifies the txs on Basescan, posts `/api/staking/positions`, hands over the one-time key (Seam 1).
- [ ] **3. Real AI:** tester calls `POST /v1/chat/completions` with the key (or uses the app) → answer is from the warm route: `fish.route: "ocean-demo-vllm"`, `fish.costState: "provider_verified"`, `fish.runnerSignatureState: "verified"`.
- [ ] **4. Capacity:** tester approves FISH + stakes into the capacity pool ("Serve capacity" panel).
- [ ] **5. Settle:** operator sums usage (`/api/usage/summary`) and posts the settlement with `submitOnchain: true` + fresh `idempotencyKey` (Seam 2); response shows `submitState: "submitted"` + confirmations.
- [ ] **6. Claim:** tester claims USDC from `/credits`; claim tx verified on Basescan.
- [ ] **7. Close:** record tx hashes, settlement id, position id, and timings in the rehearsal log; rotate `FISH_ADMIN_TOKEN`; note every place you had to deviate from this doc.

**Pass =** one unbroken stake → mint → operator-issued credits → real AI → on-chain settlement → USDC claim, with every tester-visible label saying "operator-verified."

## 4. Quick references

| Check | Endpoint |
|---|---|
| Contracts live | `GET /api/contracts/status` |
| Warm AI status | `GET /api/warm/status` (admin live probe: `?probe=live` + `x-fish-admin-token`) |
| Staking positions (public list) | `GET /api/staking/positions` |
| Usage totals | `GET /api/usage/summary` |
| Settlement history | `GET /api/proof/capacity-settlements` |

Failure honesty: if the GPU box dies mid-demo, requests fail within `FISH_CHAT_TIMEOUT_MS` (60s default) and credits are auto-released — say "the warm route is down," don't quietly fall back to mock and present it as real AI.
