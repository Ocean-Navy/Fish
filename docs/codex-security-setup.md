# Codex Security Setup

This runbook prepares Fish for Codex Security cloud scans on `main`.

Codex Security scans connected GitHub repositories through Codex Cloud. It uses a Codex cloud environment for setup and validation. The environment should make the repository buildable, but it must not contain production credentials.

## Recommended Environment

Create a Codex cloud environment for:

```text
Repository: Ocean-Navy/Fish
Branch: main
Environment name: fish-main-security
```

Runtime:

```text
Image: universal
Node.js: 22
Internet access during setup: enabled
Agent internet access: disabled or limited
```

Setup script:

```bash
set -euo pipefail
npm ci
npm --prefix contracts ci
npm run contracts:compile
```

Maintenance script:

```bash
set -euo pipefail
npm ci
npm --prefix contracts ci
```

Validation commands that should pass in the environment:

```bash
npm run verify
npm run contracts:test
```

## Safe Scan Configuration

Set only non-secret environment variables needed for deterministic local behavior:

```text
NODE_ENV=test
FISH_ADMIN_TOKEN=codex-security-scan-only
FISH_CHAT_ROUTE=mock
FISH_CHAT_BACKEND=mock
FISH_PUBLIC_APP_URL=http://127.0.0.1:3000
FISH_EXTERNAL_FALLBACK_FREE_ALLOWED=false
FISH_CONTRACT_ACTIONS_ENABLED=false
FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=false
FISH_CONTRACT_MAINNET_WRITES_ALLOWED=false
```

Do not add these to the Codex Security environment:

- production `FISH_ADMIN_TOKEN`;
- Stripe secret key or webhook secret;
- USDC receiver private keys or wallet seed phrases;
- contract deployer or operator private keys;
- production RPC URLs if they are paid, private, or rate-limited;
- vLLM, external AI, Ocean provider, or Fish Runner API keys;
- private provider endpoints, payout preferences, or allowlists;
- local `.env.local`, deployment artifacts, ledgers, receipts, or runtime data.

Codex cloud secrets are only available to setup scripts and are removed before the agent phase. Fish security scans should not need secrets at all.

## Creating The Scan

In Codex Security:

1. Select the GitHub organization.
2. Select `Ocean-Navy/Fish`.
3. Select branch `main`.
4. Select environment `fish-main-security`.
5. Choose a short history window for the first scan. This repo is young, so a 30-90 day window should be enough to start.
6. Create the scan and let the initial backfill finish before triaging findings.

## Threat Model Text

After the first scan, edit the Codex Security project overview to use this context:

```text
Fish is a Next.js and TypeScript product layer for simple AI access on Ocean Protocol / Oncompute infrastructure. It has public landing pages, public API routes, prototype OpenAI-compatible /v1 routes, local JSON ledgers, payment and credit top-up flows, wallet and contract status flows, Ocean batch job routes, provider pilot routes, proof dashboards, and Solidity prototype contracts for OCEAN/FISH staking and capacity-pool settlement.

Entry points include browser forms, /api routes, /v1 routes, Stripe webhook routes, USDC checkout confirmation routes, wallet-triggered contract action APIs, Ocean batch order routes, provider readiness routes, and admin export routes.

Trust boundaries include browser to Next.js API, unauthenticated public users to admin-only routes, API-key users to credit ledgers, Stripe/USDC payment events to credit issuance, wallet users to contract writes, Fish to external AI providers, Fish to Ocean/Oncompute provider endpoints, and public proof/dashboard views to private runtime ledgers.

Sensitive data includes admin tokens, API keys, Stripe secrets, RPC endpoints, contract deployer/operator keys, provider endpoints and payout data, user contact submissions, wallet/payment data, prompts, outputs, upload references, usage receipts, and local JSON ledgers.

Prioritize auth bypasses, payment or credit minting bugs, webhook signature and replay issues, USDC transaction verification mistakes, double-spend or idempotency failures, public leakage of prompts/outputs/provider data, SSRF or unsafe provider endpoint handling, local file/path handling under data/, quota and rate-limit bypasses, and smart-contract fund-safety issues such as access control, reentrancy, incorrect token accounting, unsafe cooldowns, or unsafe mainnet write gates.

Mainnet contract writes are intentionally disabled by default. Public dashboards must distinguish live, snapshot, sample, and unavailable source states. Public proof must not expose raw prompts, raw outputs, private upload content, API keys, provider endpoints, operator notes, payout preferences, signing keys, or private wallet material.
```

## Triage Rules

- Treat findings as review inputs, not automatic merge instructions.
- Prefer fixing one validated issue per PR.
- Add focused regression coverage when a finding is confirmed.
- Re-run `npm run verify` after app changes.
- Re-run `npm run contracts:test` after contract changes.
- Keep remediation patches narrow and avoid changing product positioning or tokenomics as part of security fixes.
