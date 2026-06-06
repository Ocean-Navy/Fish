# Deep Security Scan Findings - 2026-06-06

## Scope

- Scan type: Codex Security Deep Security Scan, repository-wide.
- Branch: `codex/deep-security-scan-opfish-2026-06-05`.
- Commit reviewed: `ee11c960`.
- Local scan ID: `ee11c960_20260605T143006Z`.
- Full Markdown report: `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/report.md`.
- HTML report: `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/report.html`.
- Artifact directory: `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/artifacts`.

The deep discovery loop reached the configured maximum round cap while the last
round still had novelty. Central validation was still completed for every
canonical candidate in the merged inventory, but this result should be treated
as high-recall evidence rather than proof that the repository is saturated.

No production network, payment, provider, onchain, or destructive exploit was
executed. Validation used static source review, route reachability analysis,
contract/control review, and repository documentation contracts.

## Summary

- Canonical candidates validated: 32.
- Reportable grouped findings: 19.
- Candidate validation receipts: 32.
- Attack-path receipts: 19.
- Worklist closure receipts: 174.
- Suppressed or deferred candidates: 7.

## Validated Findings

| ID | Severity | Finding | Main area |
| --- | --- | --- | --- |
| F-001 | High | USDC top-up confirmation is not bound to the payer wallet | `src/lib/fishPayments.ts` |
| F-002 | Medium | Guest credit and quota identity trusts spoofable forwarded headers | `app/api/meal/order/route.ts`, `app/api/dishes/[dishId]/run/route.ts` |
| F-003 | Low | Testnet faucet cooldowns trust spoofable headers and reserve after transfer | `app/api/testnet/faucet/route.ts`, `src/lib/testnetFaucet.ts` |
| F-004 | Medium | Private runner and Ocean adapter APIs fail open when API keys are unset | `deploy/warm-inference/`, `deploy/ocean-workload-adapter/` |
| F-005 | Medium | CSV exports preserve spreadsheet formulas from public and provider-controlled fields | submissions, provider receipt, and payout exports |
| F-006 | Medium-Low | Public provider pilot registry exposes operator allowlist decision metadata | `src/lib/providerPilot.ts` |
| F-007 | Medium | Local JSON ledgers use non-atomic read-modify-write flows for credits and quotas | `src/lib/fishLedger.ts`, `src/lib/fishQuota.ts` |
| F-008 | Medium-Low | Public Ocean resources expose exact operator node endpoints | `app/api/ocean/resources/route.ts` |
| F-009 | Medium | Direct Ocean batch endpoint bypasses plan, privacy, and pre-execution cost controls | `app/api/ocean/batch/jobs/route.ts`, `src/lib/oceanBatch.ts` |
| F-010 | Medium | Public proof summary returns raw provider receipts instead of redacted public views | `src/lib/providerJobs.ts` |
| F-011 | Medium | Capacity settlement idempotency is checked before the onchain paid-usage transaction | `src/lib/capacitySettlements.ts` |
| F-012 | Medium-Low | Public submission and wallet-intent APIs can create unbounded local JSON records | `src/lib/submissions.ts`, `src/lib/walletIntents.ts` |
| F-013 | Medium | Provider HTTP responses are Fish-signed and accrued as payout proof without independent attestation | `src/lib/providerJobs.ts` |
| F-014 | Medium | Ocean compute environment generator can leave free compute open by default | `scripts/generate-ocean-node-compute-env.mjs` |
| F-015 | Medium-Low | Unauthenticated billing analytics exposes operator commercial metrics | `app/api/billing/usage-analytics/route.ts` |
| F-016 | High | Staking reward updates can drain approved OCEAN emissions into an unclaimable bootstrap balance | `contracts/contracts/FishOceanStaking.sol` |
| F-017 | Low | Stripe checkout accepts arbitrary success and cancel redirect URLs | `src/lib/fishPayments.ts` |
| F-018 | Medium | Public chat routes parse and stringify unbounded message bodies before token guardrails | chat, meal, and dish routes |
| F-019 | Medium | Ocean workload adapter hashes unbounded result trees before output limits apply | `deploy/ocean-workload-adapter/server.mjs` |

## Highest Priority Fixes

1. Bind USDC top-up confirmation to the expected payer wallet before credits are
   issued. This is the clearest direct credit-theft path.
2. Fix the staking prototype reward accounting before any funded emission
   deployment. Exclude contract-held bootstrap supply from reward-bearing
   supply or remove the self-mint.
3. Fail closed on missing sidecar API keys for the runner and Ocean workload
   adapter outside an explicit local-development mode.
4. Apply the Fish route, plan, privacy, and cost controls to the direct Ocean
   batch endpoint before it can launch adapter work.
5. Redact public proof, provider, Ocean resource, and billing analytics outputs
   so public views cannot expose operator-only metadata.

## Candidate Closures

| Candidate | Closure |
| --- | --- |
| OPFISH-CANON-012 | Rejected as not deployed: the `legacy/static-prototype` `innerHTML` issue is in checked-in reference code, not the current Next.js app route surface. |
| OPFISH-CANON-015 | Deferred as demo-default hardening: static demo credentials are example placeholders and loopback-oriented; fail-open sidecar auth is covered by F-004 and open free compute is covered by F-014. |
| OPFISH-CANON-018 | Rejected for insufficient proven impact: unknown runner-key receipts were not proven to be counted as verified trusted public proof in the reviewed path. |
| OPFISH-CANON-019 | Deferred into more specific findings: provider-controlled billable usage is covered by F-009 and F-013. |
| OPFISH-CANON-020 | Deferred as demo-default hardening: predictable placeholders are examples, while material auth and compute exposure risks are covered separately. |
| OPFISH-CANON-025 | Rejected against current product contract: staking and wallet-intent docs/OpenAPI intentionally describe public-safe holder credit records and deterministic wallet surrogates, with no raw wallet or secret exposure proven. |
| OPFISH-CANON-028 | Reported as F-015, but severity is moderated because README/API examples appear to intentionally expose the analytics endpoint publicly. |

## Source-State And Privacy Impact

Several findings are specifically about Fish public/private boundaries:

- F-006 exposes operator allowlist owner and decision-reason metadata.
- F-008 exposes exact Ocean node endpoints in public resources.
- F-010 exposes raw provider receipts where a public-safe receipt mapper exists.
- F-015 exposes operator billing economics and route/model mix.

No validated finding found raw prompt or raw output text intentionally stored in
public proof. F-009 and F-018 cover paths where raw payloads or oversized prompt
content can cross a boundary before intended guardrails run.

## Routes, Endpoints, And Environment Variables Affected

Affected routes and services include:

- `/api/billing/checkout/usdc`, `/api/billing/checkout/usdc/confirm`,
  `/api/billing/checkout/stripe`, and `/api/billing/usage-analytics`.
- `/api/meal/order`, `/api/dishes/[dishId]/run`, and `/v1/chat/completions`.
- `/api/ocean/resources` and `/api/ocean/batch/jobs`.
- Provider pilot, proof summary, provider jobs, proof benchmarks, CSV exports,
  capacity settlements, submissions, wallet intents, and testnet faucet routes.
- Warm inference runner and Ocean workload adapter services.
- Prototype contracts under `contracts/contracts/`.

Relevant environment variables or deployment settings include:

- `FISH_ADMIN_TOKEN`
- `FISH_RUNNER_API_KEY`
- `FISH_OCEAN_ADAPTER_API_KEY`
- `FISH_OCEAN_BATCH_ENDPOINT`
- `FISH_OCEAN_BATCH_PRIVATE_PAYLOAD`
- `FISH_STRIPE_SECRET_KEY`
- USDC checkout receive/RPC configuration
- Testnet faucet private key/RPC/token configuration
- Contract write and settlement configuration

## API Contract Impact

This branch documents findings only; it does not change route behavior or public
API response shapes. `api/openapi.yaml` was not updated.

Fixes for F-006, F-008, F-010, F-015, and F-009 may need OpenAPI updates if
public response fields are removed, redacted, or moved behind admin-only
endpoints.

## Validation Artifacts

- Final report validator passed for
  `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/report.md`.
- Candidate validation receipts:
  `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/artifacts/03_coverage/candidate_validation_receipts.jsonl`.
- Attack-path receipts:
  `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/artifacts/03_coverage/attack_path_receipts.jsonl`.
- Worklist closure receipts:
  `/tmp/codex-security-scans/opfish/ee11c960_20260605T143006Z/artifacts/03_coverage/worklist_completion_receipts.jsonl`.

## Repository Validation

Passed:

```bash
bash -lc 'source /Users/robin/.nvm/nvm.sh && nvm use 22 && npm run verify'
```

Notes:

- `npm ci` was run first because `node_modules` was absent in this worktree.
- `npm run verify` passed lint, app tests, typecheck, and build.
- The build emitted the existing Turbopack NFT-list warning for
  `next.config.ts` through `src/lib/capacitySettlements.ts`; it did not fail
  the build.
