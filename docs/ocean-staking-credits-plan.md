# OCEAN Staking Credits Plan

## Purpose

Phase 4 gives OCEAN holders a measurable utility path without pretending that staking alone pays providers. The first version is an offchain funded-budget prototype:

```text
operator verifies OCEAN lock intent
-> Fish records the stake position
-> Fish issues spendable API credits from a capped budget
-> dashboard tracks OCEAN locked, credits issued, and credits spent
```

## Public-Safe Contract

- Public summaries show aggregate OCEAN amount, issued/spent credits, budget remaining, and opaque position records for state tracking.
- Public summaries must not expose holder labels, wallet hash prefixes, exact per-position stake metadata, or per-account credit balances unless a future holder opt-in disclosure flow is added.
- API keys are returned once on creation and only a hash is stored in the Fish credit ledger.
- This is not an onchain staking contract and must be labeled `offchain_prototype`.
- Provider bonds are a separate supply-side utility lane. See `docs/provider-bonds-plan.md`; staking credits must not be mixed with provider bond custody or routing eligibility.
- Tokenized credits are a later composability lane. See `docs/tokenized-credits-plan.md`; the staking-credit prototype should stay offchain and budget-capped.

## Endpoints

```text
GET  /api/staking/summary
GET  /api/staking/positions
POST /api/staking/positions
GET  /api/staking/wallet-intents
POST /api/staking/wallet-intents
```

`POST /api/staking/positions` is admin-only and accepts:

```json
{
  "holderLabel": "Pilot holder",
  "walletRef": "0x...",
  "oceanAmount": 1000,
  "lockDays": 30,
  "issueApiKey": true
}
```

`POST /api/staking/wallet-intents` is a website prototype for holders. It accepts a connected EVM address, chain id, intended OCEAN amount, lock days, a plain-language message, and an EVM signature. Fish stores only public-safe hashes and a short address prefix. This route does not issue credits and does not stake OCEAN; it records holder intent until a lock contract or operator verification flow exists.

## Budget Policy

Defaults:

```text
FISH_STAKING_CREDIT_BUDGET=10000
FISH_STAKING_CREDITS_PER_OCEAN_MONTH=0.1
```

Credit calculation:

```text
floor(oceanAmount * lockDays / 30 * creditsPerOceanMonth)
```

Credits are capped by the remaining funded budget. If the budget is exhausted, positions are queued instead of creating unfunded provider liability.

## Definition Of Done

- Staking positions persist under `data/staking/positions/`.
- Creating a funded position can issue a spendable Fish API key.
- Public dashboard shows aggregate OCEAN staked, credits issued, credits spent, and budget remaining.
- Public responses do not expose raw wallet references, wallet hash prefixes, holder labels, per-position stake metadata, per-account credit balances, or API key hashes.
- Wallet intent responses do not expose raw signatures or full wallet addresses.
- Docker and Compose persist `/app/data/staking`.
