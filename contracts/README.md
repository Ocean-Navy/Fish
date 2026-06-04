# Fish Contracts Prototype

This package contains prototype Solidity contracts for the Fish OCEAN/FISH and capacity-pool workstream.

Status:

- Prototype only.
- Not audited.
- Not ready for mainnet funds.
- Intended for local tests, testnets, and OceanDAO/partner review.

## Contracts

```text
FishToken.sol            DIEM-style FISH token with role-gated mint/burn and stake cooldown.
FishOceanStaking.sol     Venice-style OCEAN deposit, sOCEAN accounting, FISH mint/burn, optional funded emissions.
FishCapacityPool.sol     AntSeed-inspired FISH capacity pool for paid USDC demand.
FishERC1967Proxy.sol     ERC1967 proxy wrapper for the UUPS staking contract.
test/TestERC20.sol       Local test token fixture.
```

## Commands

From the repository root:

```bash
npm run contracts:compile
npm run contracts:test
npm run contracts:deploy:testnet
```

Or directly:

```bash
npm --prefix contracts run compile
npm --prefix contracts test
npm --prefix contracts run deploy:testnet
```

Hardhat warns when run on unsupported Node.js versions. Use Node.js 22 for the most stable local workflow.

## Base Sepolia Deployment

Set a Base Sepolia RPC URL and a funded deployer key:

```bash
BASE_SEPOLIA_RPC_URL=https://... \
FISH_CONTRACT_DEPLOYER_PRIVATE_KEY=0x... \
npm run contracts:deploy:testnet
```

Optional env:

```text
FISH_CONTRACT_OCEAN_TOKEN_ADDRESS=
FISH_CONTRACT_USDC_TOKEN_ADDRESS=
FISH_CONTRACT_TREASURY_ADDRESS=
FISH_CONTRACT_EMISSION_SOURCE_ADDRESS=
FISH_CONTRACT_OPERATOR_ADDRESS=
FISH_TESTNET_FISH_COOLDOWN_SECONDS=300
FISH_TESTNET_OCEAN_COOLDOWN_SECONDS=300
FISH_TESTNET_MIN_UNSTAKE_BATCH_OPEN_SECONDS=60
```

If OCEAN or USDC token addresses are omitted, the script deploys local test tokens and mints test balances to the deployer/operator for end-to-end testnet flow testing. The script uses short testnet cooldowns by default so the full entry and exit path can be tested in one session. The script prints the `FISH_CONTRACT_*` web-app env block and writes an ignored `.local.json` deployment artifact under `contracts/deployments/`.

## Design Notes

The contracts intentionally keep the Venice flow recognizable:

```text
OCEAN -> sOCEAN -> lock sOCEAN -> mint FISH -> burn FISH -> unlock sOCEAN -> withdraw OCEAN
```

The core compatibility difference is emissions:

```text
Venice: staking contract mints VVV rewards.
Fish: staking contract can pull funded OCEAN from an emission source.
```

If the emission rate is zero, no OCEAN rewards are distributed. That is the expected default unless an OceanDAO or operator-funded reserve is explicitly configured.

The capacity pool follows the AntSeed pattern at a simpler boundary:

```text
FISH holders stake into the pool
operator records paid USDC demand
operator fee is taken
net USDC is distributed pro-rata to capacity stakers
```

No contract here promises guaranteed yield, guaranteed API credits, or guaranteed provider earnings.
