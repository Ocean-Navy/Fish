# Track B runbook — SC2 verify → SC4 Base Sepolia deploy

Companion to `PHASE_1_WORK_PACKAGES.md` (Track B). SC1 (indexed-user events) and SC3 (opt-in emission funding) are already implemented in the repo. This runbook is the part that must run on **your** machine: the toolchain can't run in the agent sandbox (compiler/npm downloads blocked), and the deploy uses **your** private key, which you never paste to an agent.

## Prerequisites

- Node 22, repo at a clean checkout of the branch with the SC1/SC3 changes.
- For Slither: Docker (recommended lane, matches `SLITHER_TRIAGE.md`), or `slither` on PATH via `python3 -m pip install slither-analyzer`.
- For deploy: a Base Sepolia RPC URL (public `https://sepolia.base.org` works; an Alchemy/Infura/CDP endpoint is more reliable) and a **throwaway testnet deployer key** holding only Base Sepolia ETH. ~0.05 Base Sepolia ETH is comfortable headroom for the ~12–15 deploy/config transactions (get it from the Coinbase Developer Platform or Alchemy Base Sepolia faucet, or bridge from Sepolia).

## Step 1 — SC2: tests + Slither (gate; must be green before deploy)

```bash
npm --prefix contracts ci
npm run contracts:test
npm run contracts:security:docker   # Slither in Docker (the lane used for SLITHER_TRIAGE.md)
# or, if slither is installed locally:
npm run contracts:security
```

Good output looks like:

- `contracts:test` — all specs pass across **three** files: `fish-contracts.test.js` (incl. the updated `FishMinted`/`FishBurned` `withArgs` assertions), `fish-contract-invariants.test.js`, and the new `deploy-testnet-emissions.test.js` (funded → rewards accrue; unfunded → zero; wrong emission source → clear error).
- Slither — `0 result(s) found`, matching the clean baseline in `contracts/SLITHER_TRIAGE.md` (2026-06-06). The SC1 change should not add findings: the new `user` parameter is `indexed` (satisfies `unindexed-event-address`) and the emits stay **before** the external `fish.mint`/`fish.burn` calls (preserves the `reentrancy-events` resolution).

If anything is red, stop and paste the output back into the session — findings get triaged before deploy, per SC2.

## Step 2 — SC4: deploy to Base Sepolia

Set env in your shell (key stays with you; consider `read -s` so it skips shell history):

```bash
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"   # or your provider URL
read -s FISH_CONTRACT_DEPLOYER_PRIVATE_KEY && export FISH_CONTRACT_DEPLOYER_PRIVATE_KEY

# Recommended for the demo: fund emissions so staking shows yield (SC3).
# Defaults: rate 0.001 OCEAN/s (~86.4 OCEAN/day), reserve 5000 OCEAN (~57 days).
export FISH_TESTNET_FUND_EMISSIONS=true
# Optional overrides:
# export FISH_TESTNET_EMISSION_RATE_PER_SECOND=0.001
# export FISH_TESTNET_EMISSION_FUND_AMOUNT=5000
```

Notes on optional env: leave `FISH_CONTRACT_TREASURY_ADDRESS` / `FISH_CONTRACT_EMISSION_SOURCE_ADDRESS` / `FISH_CONTRACT_OPERATOR_ADDRESS` unset to default them all to the deployer. **If you set a custom emission source, the funding flag will refuse to run** (`fundEmissions` is restricted to the emission source, and the script can only sign as the deployer) — deploy unfunded instead and fund from that address afterwards. Leave the token address envs unset so the script deploys fresh test OCEAN/USDC and mints you 1,000,000 test OCEAN (the emission funding draws from this).

Run it:

```bash
npm run contracts:deploy:testnet
```

Good output looks like:

- A `FISH_CONTRACT_*` env block with six contract addresses (ocean, usdc, fish, staking implementation, staking proxy, capacity pool), `FISH_CONTRACT_CHAIN_ID=84532`, explorer `https://sepolia.basescan.org`.
- Testnet cooldowns: FISH 300s, OCEAN 300s, capacity batch 60s (defaults).
- An emission-funding block: rate `0.001` OCEAN/second, funded `5000.0`, **emission reserve `5000.0` OCEAN**. (If you deployed unfunded, it instead prints that rewards stay zero by design.)
- A new artifact at `contracts/deployments/baseSepolia-<timestamp>.local.json` (gitignored) containing the same data plus an `emissionFunding` object.

## Step 3 — generate the web overlay

```bash
npm run secrets:public-testnet -- \
  --contract-deployment contracts/deployments/baseSepolia-<timestamp>.local.json \
  --include-wallets --include-faucet > .env.public-testnet.local
```

The script auto-fills the RPC (`https://sepolia.base.org`) and the faucet token addresses from the artifact; `--include-wallets`/`--include-faucet` are only valid because the artifact is Base Sepolia (`chainId 84532`). The output contains secrets — keep the file private.

## Step 4 — sanity check

With the overlay applied to the web app env, start the app and:

```bash
curl -s localhost:3000/api/contracts/status
```

Expect `configured: true`, `chainId: 84532`, mode `testnet_actions` (or `configured_read_only` without action flags), and **live totals** (`totalStakedOcean` etc. non-null, read from the deployed contracts rather than placeholders).

## Step 5 — paste back for verification

Paste into the session: the deploy env block + emission-funding summary (addresses are public; no secrets), and the `/api/contracts/status` JSON. The agent then verifies addresses/artifact consistency and confirms the SC1 event shape in the deployed ABI (`user` indexed on `FishMinted`/`FishBurned`).

## Convergence

When this is green and live, Track B is done: SC1 events are in the deployed bytecode, SC2 gates passed, SC3 makes the demo show yield, SC4 wires the app. Remaining Phase-1 gates (`PHASE_1_WORK_PACKAGES.md` §6): WP8 GPU run + WP7/M0.9 operator rehearsal.
