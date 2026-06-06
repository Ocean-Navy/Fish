# Non-GPU Publish Readiness

This checklist covers the next Fish version work that can be finished before renting or configuring a GPU VM.

## Can Ship On The Small Web VM

- Visual Fish market homepage and meal counter.
- Dish-only menu images for `/ask`.
- Public pages: `/`, `/ask`, `/credits`, `/privacy`, `/proof`, `/routing`, `/api`, `/docs`.
- Waitlist and provider signup capture.
- Admin-only signup/provider exports.
- Public Ocean / Oncompute supply dashboard with source-state labels.
- Public proof pages with sample/snapshot/live labels.
- Testnet faucet UI and API, disabled by default.
- Wallet intent flow for OCEAN lock interest, with no credit issuance.
- Stripe and USDC checkout routes, disabled until secrets and prepaid liability caps are configured.
- Contract status and wallet-action gates, read-only by default.
- Local Ocean Node / batch proof docs and Compose stack for local or future GPU-host validation.

## Required Before Public Refresh

1. Keep `FISH_ADMIN_TOKEN` set in production.
2. Decide the `/ask` route mode:
   - `FISH_CHAT_ROUTE=mock` for a clearly labeled demo mode;
   - `FISH_CHAT_PAUSED=true` if orders should not run before Fish Runner exists;
   - `external-fallback` only with a hard budget and visible privacy caveat.
3. Keep paid checkout paused unless all of these are true:
   - `FISH_MAX_OUTSTANDING_PREPAID_CREDITS` is set;
   - Stripe or USDC secrets are set;
   - `FISH_BILLING_SUPPORT_URL` and `FISH_BILLING_REFUND_POLICY_URL` are configured;
   - public copy does not imply unlimited access.
4. Keep `FISH_TESTNET_FAUCET_ENABLED=false` until the faucet wallet has only limited Base Sepolia ETH and test tokens, and until nginx/private proxy is configured with `FISH_PROXY_HEADER_SECRET` for trusted IP cooldown headers.
5. Keep `FISH_CONTRACT_ACTIONS_ENABLED=false`, `FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=false`, and `FISH_CONTRACT_MAINNET_WRITES_ALLOWED=false` unless a testnet/mainnet deployment has been reviewed.
6. Triage any Codex Security findings that apply to `main` or this branch. Apply only reviewed, narrow fixes.
7. Run:

```bash
npm run verify
npm run readiness:public-testnet
npm run readiness:public-testnet -- --strict
npm run readiness:public-testnet -- --profile paid-mainnet
npm run backup:runtime -- --dry-run
docker compose config >/tmp/fish-compose.yml
```

The default readiness profile is for a no-real-money public testnet and allows intentionally paused paid checkout. Add `--strict` when every manual and partial item must be resolved. The `paid-mainnet` profile must stay blocked until the payment provider, liability cap, and support/refund path are ready.

8. Browser-check:
   - `/`
   - `/ask`
   - `/credits`
   - `/proof`
   - `/privacy`
   - `/api`

## GPU-Only Follow-Up

These should stay out of the small web VM launch scope:

- NVIDIA vLLM runtime.
- Public Fish Runner serving real warm AI.
- GPU-backed Ocean Node compute containers.
- Paid external Oncompute provider execution.
- Public claims that Fish has live Ocean-backed inference.

## Honest Public Claim Before GPU

Use this framing if the next public version ships before the GPU VM:

```text
Fish is a visual product preview and playground for simple AI access on Ocean infrastructure. The meal counter is in demo mode until Fish Runner or a selected provider is connected. Public proof labels show whether data is sample, snapshot, or live.
```
