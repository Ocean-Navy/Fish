# Tokenized Credits Plan

## Purpose

Phase 7 defines how Fish Credits could become more composable after the product has real usage, provider settlement, proof dashboards, and risk controls. This is deliberately late-roadmap work.

The first Fish Credits implementation should stay internal and offchain. Tokenized credits should not launch until Fish can prove:

- users spend credits on real AI work;
- providers are paid from revenue, reserves, or funded budgets;
- outstanding credit liability is capped and visible;
- legal, audit, and incident-response work is complete.

## Principles

- Product first. Token utility after usage.
- Credits represent access to AI work, not guaranteed yield.
- Never create provider liabilities that are not funded.
- Prefer restricted or non-transferable credits before open transferability.
- Public dashboards must show reserves, outstanding credits, spent credits, and settlement coverage.
- Legal review, security review, and pause controls are launch requirements, not polish.

## System Boundary

```text
Internal Fish Credits ledger
  -> funded issuance policy
  -> reserve and liability dashboard
  -> restricted credit design
  -> audited token contract or bridge
  -> optional capacity pool
```

Tokenized credits must stay separate from:

- provider payout accounting;
- provider bond custody;
- user OCEAN staking records;
- proof receipts;
- raw prompt and output data.

## Milestone C7.0 - Internal Credit Maturity Gate

### Outcome

Fish proves that credits are useful before making them transferable or externally composable.

### Required Evidence

- active users spend credits through the app or API;
- credit debits reconcile with usage receipts;
- provider costs and payouts reconcile with proof records;
- refunds, failed requests, and fallback routes are handled without double charging;
- dashboard reports outstanding, issued, spent, expired, and refunded credits.

### Definition Of Done

- Credit balance math is covered by tests or deterministic fixtures.
- Usage receipts can explain why credits moved.
- Operators can pause credit issuance.
- Public copy still says tokenized credits are later.

## Milestone C7.1 - Liability And Reserve Policy

### Outcome

Fish has a hard cap on credit liabilities and a visible policy for what backs them.

### Required Controls

```text
max outstanding credits
max credits per account
reserve balance source
settlement coverage ratio
expiry policy
refund policy
pause policy
operator approval threshold
```

### Definition Of Done

- New credits cannot be issued beyond the configured liability cap.
- Reserve and liability numbers are visible to operators.
- Public summaries can show coverage without exposing private treasury details.
- Provider payout obligations are not netted against unrelated staking or bond balances.

## Milestone C7.2 - Credit Design Choice

### Outcome

Fish chooses the least risky credit form that still serves the product.

### Options

```text
offchain ledger only
non-transferable onchain credit
restricted-transfer credit
ERC1155 credits by class
transferable ERC20-style credit
```

Default recommendation:

```text
internal ledger -> non-transferable or restricted transfer -> open transferability only after review
```

### Definition Of Done

- The chosen design has a written reason and rejected alternatives.
- Transferability, expiry, account limits, and pause controls are explicit.
- The design avoids guaranteed yield language.
- Legal review signs off before any public launch.

## Milestone C7.3 - Burn-To-Unlock Or Debt Mechanic

### Outcome

Fish has a safe spec for the strongest Venice-like mechanic, but does not ship it early.

### Concept Flow

```text
lock OCEAN or approved receipt-backed collateral
-> mint restricted Fish Credits
-> spend credits on AI work or allocate capacity
-> burn or repay credits
-> unlock collateral after delay and checks
```

### Required Controls

- conservative loan-to-value or issuance ratio;
- oracle policy if any non-credit collateral is valued;
- volatility buffer;
- liquidation or unwind policy;
- debt ceiling;
- emergency pause;
- settlement coverage dashboard;
- external audit.

### Definition Of Done

- Burn-to-unlock cannot create underfunded provider payout obligations.
- Users can understand how to unlock without financial jargon.
- The mechanism can be paused before new debt is created.
- The team has reviewed whether this is legally appropriate before implementation.

## Milestone C7.4 - Capacity Pool

### Outcome

Unused credits can be studied as a capacity-allocation layer without promising revenue sharing.

### Concept Flow

```text
credit holder allocates unused credits
-> pool receives AI demand
-> Fish routes work to providers
-> credits are consumed
-> providers are paid
-> pool accounting updates
```

### Guardrails

- No direct revenue distribution without legal review.
- Credits allocated to a pool must remain capped by settlement coverage.
- Pool usage must produce normal receipts and provider payout records.
- Users must be able to see what was consumed and what remains.

### Definition Of Done

- Pool accounting reconciles credits allocated, consumed, returned, and expired.
- Provider payout records remain separate from pool accounting.
- Public copy avoids passive-income framing.
- Operators can pause pool allocations.

## Milestone C7.5 - Contract And Launch Readiness

### Outcome

The team can decide whether tokenized credits are ready for implementation.

### Required Work

- contract spec;
- threat model;
- audit plan;
- legal review;
- migration plan from offchain balances;
- reserve dashboard;
- incident response runbook;
- user-facing terms and risk copy.

### Definition Of Done

- Contracts are audited before holding real value.
- Pause and migration controls are tested.
- Public docs explain credit backing, limits, expiry, and transfer rules.
- Tokenized credits launch only after usage, settlement, and reserves are proven.

## Public Page Requirements

The `/credits` page should stay simple:

- show staking credits as the active or prototype lane;
- show provider bonds as a separate future supply-side lane;
- show tokenized credits as a later lane;
- avoid price, yield, or token-launch hype;
- repeat that credits need real usage and settlement coverage.

## Out Of Scope For Phase 7

- guaranteed yield;
- open token sale;
- unfunded credit issuance;
- automatic provider settlement from staking;
- slashing provider bonds;
- privacy claims unrelated to actual routing.

## Open Questions

- Should the first tokenized credit be non-transferable, restricted-transfer, or remain offchain?
- What reserve coverage ratio is acceptable before public credit composability?
- Should credits expire, and how should expiry affect provider settlement reserves?
- Which legal jurisdictions and user groups are allowed for any transferable version?
- Should the capacity pool come before or after an onchain credit contract?
