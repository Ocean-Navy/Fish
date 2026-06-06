# Billing And Top-Ups Plan

## Purpose

This plan covers the commercial Fish Credits layer before tokenized credits. It turns the current prototype credit ledger into a safer path toward free credits, subscriptions, prepaid top-ups, usage analytics, and payment integration.

Billing is not provider settlement. Users can pay with Fish Credits, subscription credits, prepaid balance, card checkout, or USDC once the relevant provider secrets are configured, but selected providers should be paid from hard settlement funds, reserves, or funded budgets.

## Principles

- Keep the OpenAI-compatible API useful before adding billing complexity.
- Do not sell credits that cannot be backed by provider-payment coverage.
- Make every debit traceable to a usage receipt.
- Refund failed requests before more advanced spend priority work.
- Keep subscription claims simple: access and usage limits, not yield.
- Do not store raw prompts or outputs in billing records.

## Spend Priority

Initial target:

```text
Fish grant credits
-> subscription credits
-> prepaid top-up balance
-> external payment fallback
```

Rules:

- One request creates one debit decision.
- A request cannot consume from two lanes unless the accounting row explains the split.
- Failed or cancelled requests should refund the same lane they consumed.
- Provider payout accounting remains separate from user billing lanes.

Current prototype behavior: `/v1/chat/completions` reserves the maximum estimated request credits before the backend call, releases unused reserve on success, and releases the full reserve on backend failure before a usage receipt is written.

Current spend behavior: one request consumes one lane. Fish spends grant credits first, then unexpired subscription, prepaid, staking, adjustment, and refund credits. Expired positive credit entries are excluded from reservation and debit availability. Mixed-lane debits are a future accounting upgrade.

## Milestone BIL1 - Credit Ledger Split

### Outcome

Fish can distinguish where credits came from and how they were spent.

Current prototype status: `/v1/balance`, `/v1/usage`, `/account`, and the dashboard now expose credit lanes. New pilot-key grants and chat debits write immutable local entries under `data/fish/credit_entries.json`.

Current API key status: admin-created pilot keys are returned once and stored only as hashes. The account page and `/v1/api_keys/current` can rename, rotate, and revoke the active key. Rotation keeps the same credits and receipts, returns the new key once, and makes the old key invalid.

### Credit Lanes

```text
grant
subscription
prepaid
staking
adjustment
refund
```

### Ledger Fields

```text
entryId
accountId
lane
kind
amount
requestId
receiptId
expiresAt
createdAt
operatorReason
```

### Definition Of Done

- Balances can be grouped by lane.
- Usage receipts link back to debit entries.
- Refund entries reverse the original lane.
- Account views can show grants, subscription credits, prepaid balance, spent credits, and expiry state.

## Milestone BIL2 - Plans

### Outcome

Fish has a simple pricing/limits model without over-promising token mechanics.

Current prototype status: `/api/billing/plans` exposes Free, Pro, Team/API, and Provider-test plan metadata. `/api/billing/subscriptions` lets an operator activate a pilot plan, set expiry metadata, and grant subscription credits with idempotency protection. Runtime entitlement checks resolve expired operator subscriptions back to the Free plan for model access, quota, rate limits, fallback/provider routing, and Ocean batch access. `/v1/balance` and `/account` show the account plan, source, start time, and expiry. Public subscription checkout is still future-gated; prepaid top-ups now have Stripe and USDC checkout paths when configured.

### Initial Plan Shape

```text
Free
Pro
Team/API
Provider/operator test
```

Plan fields:

```text
planId
monthlyCreditGrant
rateLimitPerMinute
monthlyRequestLimit
maxStoredThreadItems
allowedModels
externalFallbackAllowed
oceanProviderAllowed
```

### Definition Of Done

- Plan limits are visible in an account response or operator summary.
- Monthly credits have an expiry or banking policy.
- Plan copy says what users get, not what tokens may do later.
- Provider settlement coverage is reviewed before paid plans are enabled.

## Milestone BIL3 - Top-Ups

### Outcome

Users can add prepaid balance after the product loop is proven.

Current prototype status: `/api/billing/topups` lets an operator add credits to a pilot account with `x-fish-admin-token`. `/api/billing/checkout/stripe` creates Stripe Checkout sessions for prepaid credits, `/api/billing/webhooks/stripe` verifies Stripe signatures before credit issuance, `/api/billing/checkout/usdc` creates Base USDC payment requests, and `/api/billing/checkout/usdc/confirm` verifies an ERC-20 transfer through the configured RPC before credit issuance. The USDC checkout request can include `payerAddress`; when supplied, Fish requires the verified transfer sender to match it.

Payment readiness update: paid checkout now requires `FISH_MAX_OUTSTANDING_PREPAID_CREDITS`, `FISH_BILLING_SUPPORT_URL`, and `FISH_BILLING_REFUND_POLICY_URL` before new checkout requests can be created. The public `/support` page and `POST /api/support` create private billing/refund tickets under `data/support/`; `/refunds` gives the launch policy. `FISH_PAID_TOPUPS_PAUSED=true` pauses new paid checkout requests without disabling existing balances. Checkout requests that include both `amountUsd` and `credits` must match the configured Fish Credit price exactly, so a user cannot request more credits than the payment amount covers.

### Required Controls

- minimum and maximum top-up amount;
- refund policy;
- expiry policy;
- fraud and chargeback policy;
- payment provider event id;
- idempotency key;
- settlement coverage update;
- operator pause control.

### Future Endpoint Shape

```text
GET  /v1/billing/balance
GET  /v1/billing/usage
GET  /v1/billing/usage-analytics
POST /api/billing/topups
POST /api/billing/subscriptions
POST /api/billing/checkout/stripe
POST /api/billing/webhooks/stripe
POST /api/billing/checkout/usdc
POST /api/billing/checkout/usdc/confirm
POST /v1/topups
POST /v1/admin/grants
```

### Definition Of Done

- A top-up creates an immutable credit entry.
- Duplicate payment webhooks do not double-credit an account.
- Refunds reduce prepaid balance or create a negative adjustment.
- Public copy avoids investment, yield, or token-launch framing.

## Milestone BIL4 - Usage Analytics

### Outcome

Users and operators can understand where credits went.

Current prototype status: `/api/billing/usage-analytics` is admin-only and exposes aggregate requests by day, credits by lane/model, route mix, and margin fields without API keys, raw prompts, outputs, or account rows.

### Metrics

```text
requests by day
credits by lane
credits by model
route mix
external fallback cost
Ocean provider cost
gross margin
refunds
failures
top-up balance
subscription credits remaining
```

### Definition Of Done

- Account views show recent receipts and totals without prompt text.
- Operator views can compare user charges, provider costs, and margin.
- Analytics separate Fish usage from network-wide Oncompute usage.
- Exported billing rows exclude API keys and raw prompt/output text.

## Milestone BIL5 - Checkout Readiness

### Outcome

The team can operate Stripe and Base USDC prepaid top-ups safely enough for a capped public pilot.

### Required Work

- payment provider choice; Stripe and Base USDC are the current implementation targets;
- webhook idempotency;
- tax and invoice assumptions;
- refund and support flow;
- abuse controls;
- account limits;
- privacy copy;
- legal review for paid plans and wallet payments.

### Definition Of Done

- Checkout cannot issue credits above liability caps.
- Credits are not marketed as transferable assets.
- Provider payment budget is visible before paid plans go live.
- Operators can pause top-ups without disabling existing account balances.

## Public Page Requirements

`/account` should show payment controls only as prepaid credit top-ups:

- current balance and receipts are live prototype features;
- operator-activated plan credits, card top-ups, and USDC top-ups are pilot features;
- credits need backing from revenue, reserves, or funded budgets;
- no token, yield, or provider-payment promises.

## Open Questions

- Should monthly credits expire or bank for a limited period?
- Should top-ups be fiat-first, USDC-first, or operator-grant-only until volume exists?
- What reserve coverage ratio is required before prepaid top-ups?
- Which plan should first unlock external fallback or selected Ocean provider routing?
- What account limits are needed before public signup?
