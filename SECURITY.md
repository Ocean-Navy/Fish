# Security Policy

Fish is an Ocean Navy-built product layer for AI access on Ocean Protocol / Oncompute infrastructure. Security review should focus on public API routes, payment and credit accounting, wallet and contract flows, provider routing, proof records, and privacy boundaries around prompts, outputs, uploads, and provider data.

## Reporting Security Issues

Do not open public GitHub issues for suspected vulnerabilities that could expose user data, funds, API keys, provider endpoints, or operational secrets.

For now, report privately to the repository maintainers or Ocean Navy operators. Include:

- affected route, file, contract, or component;
- steps to reproduce, if safe;
- expected impact;
- whether secrets, funds, prompts, outputs, wallet data, or provider data may be involved.

## Review Scope

High-priority areas:

- admin-only routes and `FISH_ADMIN_TOKEN` enforcement;
- payment, checkout, webhook, USDC confirmation, credit issuance, and usage ledger logic;
- `/v1` API key handling, quota checks, and receipt generation;
- wallet, staking, capacity-pool, and smart-contract write paths;
- provider route configuration, provider proof data, and payout settlement records;
- prompt, output, upload, provider, and operator-data privacy;
- local JSON persistence and path handling under `data/`;
- rate limits, replay protection, idempotency, and double-spend prevention.

Lower-priority areas:

- static visual assets;
- copy-only pages, except where security or privacy claims could mislead users;
- sample fallback data, as long as it remains clearly labeled as sample data.

## Security Invariants

- Fish is product-first and token-second.
- Public copy must not imply guaranteed yield, guaranteed provider earnings, or that staking alone funds compute.
- `live`, `snapshot`, `sample`, and `unavailable` source states must stay distinct.
- Raw prompts, raw outputs, private uploads, API keys, provider endpoints, operator notes, payout preferences, signing keys, and private wallet material must not appear in public proof, dashboards, exports, or committed files.
- Admin endpoints must require `FISH_ADMIN_TOKEN` in production.
- Mainnet contract writes must stay disabled unless explicitly enabled after review, audit, and operator approval.

## Codex Security

The repository is intended to be reviewed with Codex Security on `main`. Use the setup notes in `docs/codex-security-setup.md` so scans run with buildable dependencies but without production secrets.

Security findings are triage inputs. Do not merge suggested patches without human review, focused tests, and confirmation that the change preserves the product and privacy invariants above.
