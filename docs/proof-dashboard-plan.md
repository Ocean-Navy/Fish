# Proof Dashboard Plan

## Purpose

The proof dashboard is the Phase 2/3 operator and public evidence layer for Fish. It should show what Fish routed, which providers were selected, which jobs completed, which receipts verify, what providers are owed, and which provider routes are reliable enough to use again.

The dashboard should stay simple and visual for public users, but the underlying records must be precise enough for operators and providers to trust.

## Dashboard Principles

- No fake proof. If the data is sample, stale, or unavailable, label it.
- Public first impression should be simple: jobs, receipts, payouts, scorecards.
- Operator drilldown can be dense, but the top-level page should remain easy to scan.
- Do not expose prompts, outputs, contacts, private payout details, full node IPs, or admin notes.
- Network-wide Oncompute analytics and Fish-native usage are separate facts.
- Receipt hashes and signature status are first-class UI elements.

## Audiences

### Public Visitor

Wants to know whether Fish is real.

Visible proof:

- Ocean-native jobs completed.
- Selected providers participating.
- Receipt count.
- Provider payouts recorded or paid.
- Benchmark matrix summary.
- Public-safe provider scorecard.

### Provider

Wants to know what was routed and what is owed.

Visible proof after provider authentication:

- Own jobs.
- Own receipts.
- Accrued, approved, and paid payout events.
- Benchmark history.
- Current scorecard state.

### Operator

Wants to manage the pilot.

Visible proof:

- All provider jobs.
- Failed and timed-out jobs.
- Allowlist state.
- Payout batches.
- Disputes and adjustments.
- Receipt verification failures.

## Milestone D2.0 - Proof Data Model

### Outcome

Dashboard builders have a stable model for jobs, receipts, payouts, benchmarks, and scorecards.

### Core Entities

```text
provider_profiles
provider_allowlist
provider_jobs
usage_receipts
payout_events
payout_batches
benchmark_runs
provider_scorecards
proof_snapshots
```

### Shared Fields

Every proof entity should carry:

```text
id
createdAt
updatedAt
sourceState
visibility
operatorOwner
schemaVersion
```

Allowed `sourceState` values must stay aligned with `DASHBOARD_SPEC.md`:

```text
live | snapshot | sample | unavailable
```

Proof-specific verification fields:

```text
receiptHash
signatureStatus
verifiedAt
verificationError
publicSafe
```

Signature status values:

```text
not_required | pending | valid | invalid | missing | revoked
```

### Definition Of Done

- Dashboard can join provider jobs to receipts, payout events, benchmarks, and scorecards.
- Public-safe filtering is defined before frontend work starts.
- Sample data cannot be merged into live or snapshot totals.
- Source-state and signature-state labels are present in every proof view.

## Milestone D2.1 - Proof Summary

### Outcome

The dashboard has one simple top-level status board.

### Public Summary Cards

```text
Ocean jobs routed
Verified receipts
Pilot providers
Provider payouts
Benchmark pass rate
Ocean-native share
```

### Operator Summary Cards

```text
failed jobs
timed-out jobs
receipt verification failures
providers on probation
payouts awaiting review
disputed payout events
```

### Definition Of Done

- Public summary excludes private provider data.
- Operator summary exposes problems first.
- Each card links to the underlying receipt/job/payout rows.
- Empty state copy is clear when Fish has not routed jobs yet.

## Milestone D2.2 - Provider Scorecard View

### Outcome

Users and operators can see which providers are selected and why.

### Columns

```text
provider label
region
gpu types
pilot state
allowed workload types
job success rate
median queue seconds
median runtime seconds
benchmark pass rate
verified receipt count
accrued payout
paid payout
last routed job
```

### Score Formula V0

Use transparent weighted buckets rather than an opaque score:

```text
reliability: 40%
performance: 25%
cost confidence: 20%
operator readiness: 15%
```

Provider display states:

```text
new | allowed | preferred | probation | paused | exited
```

### Definition Of Done

- Every selected provider appears in the scorecard.
- Paused/probation providers are visually distinct.
- Public scorecard hides private operator notes.
- Score inputs link to benchmark or receipt evidence where possible.

## Milestone D2.3 - Receipt Ledger View

### Outcome

Fish can show a compact ledger of verifiable job receipts.

### Table Columns

```text
receipt id
receipt type
job id
provider label
model/workload
backend
status
usage summary
cost summary
signature status
created at
```

### Detail Drawer

Public-safe detail:

```text
canonical receipt hash
signature key id
signature algorithm
provider public label
model/workload
timestamps
usage numbers
cost numbers
input/output hash prefixes
```

Private/operator detail may add:

```text
full internal ids
retry attempts
fallback reason
error category
operator notes
```

### Definition Of Done

- Receipts can be filtered by provider, status, backend, receipt type, and date.
- Invalid or missing signatures are highlighted.
- Receipt detail never shows prompt text or output text.
- CSV/JSON export is available for operator review.

Prototype route coverage:

```text
GET /api/proof/receipts
GET /api/proof/receipts/{receiptId}
GET /api/proof/receipts/export?format=csv|json
```

## Milestone D2.4 - Payout Accounting View

### Outcome

Providers and operators can understand provider payable events.

### Views

Provider-level summary:

```text
accrued
in review
approved
paid
disputed
voided
```

Payout batch view:

```text
batch id
period
provider count
event count
approved amount
paid amount
state
created by
paid at
transaction references
```

### Definition Of Done

- Every payable row links to a receipt or manual adjustment.
- Disputed and voided rows are excluded from payable totals.
- Operators can export a payout batch before payment.
- Providers can see their own payout history after authentication.

Prototype route coverage:

```text
GET /api/proof/payouts
GET /api/proof/payouts/export
GET /api/proof/payouts/batches
GET /api/proof/payouts/batches/{batchId}/export
```

Provider-owned history still needs the provider authentication lane. The public-safe payout summary now has provider filters and provider-level rollups, but it is not a replacement for provider auth.

## Milestone D2.5 - Benchmark Matrix View

### Outcome

Fish can compare provider routes before sending user traffic.

### Matrix Axes

```text
provider
gpu type
region
model class
workload type
input/output size bucket
batch size
adapter version
```

### Cell Content

```text
latest status
sample size
success rate
median queue seconds
median runtime seconds
tokens per second
provider cost
cost per 1k tokens
last run at
receipt signature status
```

### Definition Of Done

- Untested combinations are shown as untested, not hidden.
- Benchmark failures link to receipt/error details.
- Matrix can be filtered down to selected providers only.
- Public view shows enough to build trust without exposing sensitive test payloads.

## Milestone D2.6 - Public Proof Page

### Outcome

The public dashboard explains the Fish pilot in a simple, visual way without overwhelming users.

### Suggested UI Shape

- Harbor status strip: live/snapshot/sample badge, last updated, verified receipts.
- Market counters: jobs routed, providers paid, benchmark passes.
- Provider boats: simple scorecard cards for selected providers.
- Receipt net: short table of latest public-safe receipt hashes.
- Payout chest: accrued/approved/paid summary.
- Benchmark board: small matrix with pass/fail/untested states.

### Definition Of Done

- The first viewport explains whether Fish has live pilot proof.
- Public page has no admin-only data.
- Empty states feel intentional, not broken.
- Source-state badges appear above every metric group.
- Average users can understand the page without reading dense tables.

## Proposed API Contract For Future Implementation

These endpoints are proposed for the proof-dashboard milestone. They should not replace existing V0 Ocean supply endpoints.

```text
GET /api/proof/summary
GET /api/proof/providers
GET /api/proof/receipts
GET /api/proof/payouts
GET /api/proof/benchmarks
GET /api/proof/jobs
```

Recommended query parameters:

```text
visibility=public|operator|provider
providerId=...
status=...
from=...
to=...
limit=...
cursor=...
```

Response rules:

- Public responses must use public-safe provider labels.
- Operator responses require authentication before implementation goes public.
- Provider responses must be scoped to the authenticated provider.
- Every response includes `dataState`, `lastUpdated`, `sourceCount`, and `warnings`.

## Suggested Parallel Work Packages

1. Proof data contracts: schemas, fixtures, public-safe filtering rules.
2. Scorecard and benchmark dashboard: table model, scoring formulas, sample fixtures.
3. Receipt ledger: canonical hash display, signature status UI, export shape.
4. Payout accounting dashboard: provider totals, batch exports, dispute states.
5. Public visual proof page: simple Venice fish-market metaphor on top of real proof rows.

## Phase 2/3 Dashboard Exit Criteria

The proof dashboard slice is ready when:

- Public users can see whether Fish has real Ocean-native pilot proof.
- Operators can inspect provider jobs, receipts, payouts, benchmarks, and scorecards.
- Providers can understand their own jobs and payout state.
- Receipt verification failures are visible.
- The dashboard never mixes sample, network-wide, and Fish-native data into one unlabeled total.
- The UX remains clear and visual even when the data tables become dense.

## Open Questions

- Should the first proof dashboard be public-only, operator-only, or split from day one?
- Which authentication method will gate provider/operator views?
- How much provider identity should be public during the first pilot?
- Should public receipt hashes be enough, or should Fish publish downloadable signed receipts?
- Which payout states should be visible before the first real settlement?
