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

- Public summaries show holder labels, OCEAN amount, lock duration, credit state, issued/spent credits, and unlock time.
- Public summaries expose only a wallet hash prefix, not the raw wallet reference.
- API keys are returned once on creation and only a hash is stored in the Fish credit ledger.
- This is not an onchain staking contract and must be labeled `offchain_prototype`.
- Provider bonds are a separate supply-side utility lane. See `docs/provider-bonds-plan.md`; staking credits must not be mixed with provider bond custody or routing eligibility.
- Tokenized credits are a later composability lane. See `docs/tokenized-credits-plan.md`; the staking-credit prototype should stay offchain and budget-capped.

## Endpoints

```text
GET  /api/staking/summary
GET  /api/staking/positions
POST /api/staking/positions
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
- Public dashboard shows OCEAN staked, credits issued, credits spent, and budget remaining.
- Public responses do not expose raw wallet references or API key hashes.
- Docker and Compose persist `/app/data/staking`.
