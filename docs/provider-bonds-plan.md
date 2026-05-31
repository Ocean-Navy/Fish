# Provider Bonds Plan

## Purpose

Phase 6 creates supply-side OCEAN utility without making provider routing purely pay-to-play. Provider bonds should help Fish prefer serious, accountable providers, but performance proof must matter more than bond size.

This plan depends on earlier milestones:

- selected provider registry and allowlist;
- signed provider receipts;
- payout accounting;
- benchmark matrix;
- provider scorecard;
- Fish Runner health checks for low-latency traffic.

Provider bonds are not required for V0, the first provider pilot, or the first public proof page.

## Principles

- Bonding is an eligibility and accountability signal, not a guaranteed revenue product.
- Provider score caps bond influence. A large bond cannot rescue poor reliability.
- Start with soft penalties and manual suspension. Slashing comes only after legal, dispute, and fraud-proof work is mature.
- Public metrics must avoid exposing private provider contacts, payout preferences, or sensitive infrastructure details.
- Users must not be harmed while a provider bond dispute is active.
- No provider should be asked to bond before Fish can route real demand and account for payouts.

## System Boundary

```text
Provider profile
  -> selected provider allowlist
  -> proof scorecard
  -> optional OCEAN bond
  -> routing eligibility
  -> soft penalty / pause / dispute workflow
```

Bond data should be separate from:

- user staking credits;
- Fish Credits balances;
- provider payout ledgers;
- benchmark receipts;
- runner receipts.

The bond affects routing eligibility. It does not pay providers by itself and does not fund user credits by itself.

## Milestone B6.0 - Bond Policy

### Outcome

Fish has a clear policy for who can bond, why bonding matters, and what bonding does not promise.

### Policy Rules

- Only selected or verified providers can bond in the first version.
- Bonded status may unlock higher route caps, not guaranteed jobs.
- Minimum score thresholds are required before bond weight applies.
- Manual operator review can pause bonded providers.
- Bond terms must include unlock delay, dispute hold, and emergency pause language.

### Definition Of Done

- Bond policy is documented before any contract or ledger work starts.
- Provider-facing copy avoids guaranteed yield or guaranteed route claims.
- Routing policy states how bond weight and score interact.
- Legal and risk review requirements are listed for any onchain version.

## Milestone B6.1 - Offchain Bond Prototype

### Outcome

Operators can model provider bonds before deploying contracts.

### Prototype Fields

```text
bondId
providerId
providerLabel
bondState
oceanAmount
walletRefHash
startsAt
unlockRequestedAt
unlockAvailableAt
operatorOwner
decisionReason
createdAt
updatedAt
```

Bond states:

```text
draft | active | unlock_requested | unlockable | released | held | disputed | paused
```

### Public-Safe Summary

Public rows may show:

```text
provider label
bond state
OCEAN amount bucket
score tier
routing tier
unlock state
last updated
```

Do not publish raw wallet references, private notes, contacts, or legal/dispute details.

### Definition Of Done

- Operators can create, pause, and release prototype bond records.
- Public summaries use amount buckets or rounded values when appropriate.
- Bond records link to provider profiles without duplicating private provider data.
- Prototype state is clearly labeled as offchain.

## Milestone B6.2 - Score-Capped Routing

### Outcome

Bonded providers can receive routing preference only when proof score and health support it.

### Routing Formula Shape

```text
base eligibility = selected && not paused && model allowed
score tier = benchmark pass rate + verified receipts + health + payout state
bond tier = bounded function of OCEAN bonded
routing tier = min(score tier cap, base tier + bond tier)
```

Practical rules:

- `offline` or `paused` providers receive no new routes.
- providers with failed receipt verification receive no automated payout routing;
- providers below the minimum score threshold receive no bond boost;
- bond boost should be capped so one large provider cannot dominate early traffic;
- user-facing reliability always beats bond size.

### Definition Of Done

- Routing output explains whether score, bond, health, or allowlist state limited the provider.
- Public proof can show routing tier without exposing private routing internals.
- A provider can lose route priority because of score or health despite an active bond.
- Tests or fixtures cover active, paused, low-score, and high-bond providers.

## Milestone B6.3 - Dispute And Soft Penalty Workflow

### Outcome

Fish can respond to bad provider behavior before introducing irreversible slashing.

### Soft Penalties

```text
route cap reduction
benchmark-required state
probation
pause
manual payout hold
bond unlock delay
public status downgrade
```

Dispute triggers:

- repeated job failures;
- receipt signature failures;
- misleading health reports;
- payout disagreement;
- suspected prompt/output retention beyond policy;
- operator or user support escalation.

### Definition Of Done

- Operators can hold a bond while a dispute is reviewed.
- Dispute state prevents new route boosts.
- Historical proof remains visible and immutable.
- The workflow documents who can clear, pause, or escalate a dispute.
- No automatic slashing exists in the first version.

## Milestone B6.4 - Onchain Bond Contract Readiness

### Outcome

Fish has enough evidence to decide whether an onchain ProviderBondVault is worth building.

### Contract Requirements

- deposit OCEAN;
- request unlock;
- enforce unlock delay;
- pause provider eligibility;
- hold disputed bonds;
- release funds after delay or review;
- emit events for dashboard indexing.

### Required Reviews

- legal review for provider obligations and dispute language;
- contract threat model;
- external audit before real value;
- emergency pause process;
- migration plan from offchain prototype records.

### Definition Of Done

- Contract scope is limited to bond custody and eligibility state.
- Payout accounting remains separate from bond custody.
- Slashing is excluded or heavily constrained until objective fraud proofs exist.
- Dashboard indexing can reconcile onchain events with provider profile ids.

## Public Page Requirements

The public bonds view can live inside `/credits`, `/providers`, or a later `/bonds` page. It should show:

- what provider bonds are for;
- what bonds do not promise;
- bonded provider count;
- active OCEAN bonded, if safe to publish;
- provider routing tiers;
- dispute or pause counts at an aggregate level;
- a plain caveat: score and reliability matter more than bond size.

## Out Of Scope For Phase 6

- guaranteed route allocation;
- guaranteed provider yield;
- automatic slashing;
- user staking credit funding;
- tokenized Fish Credits;
- open provider admission.

## Open Questions

- Should the first bond prototype show exact OCEAN amounts or rounded buckets publicly?
- What minimum proof score should be required before bond boost applies?
- What unlock delay is long enough for disputes without discouraging serious providers?
- Should provider bonds be per model, per GPU class, or global per provider?
- Which entity reviews disputes before any onchain bond version exists?
