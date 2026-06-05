# Fish Contracts And Capacity Pool Plan

## Purpose

This plan turns the current OCEAN staking-credit idea into a flexible onchain prototype while keeping the public product conservative.

The prototype combines two references:

- Venice-style `VVV -> sVVV -> DIEM` mechanics for locking collateral and minting a credit/access token.
- AntSeed-style DIEM provider capacity pooling for turning paid demand into USDC allocations.

The goal is not a public launch yet. The goal is to have code that can be tested while OceanDAO and ecosystem partners review whether they want to fund or support the OCEAN emission side.

## Current Status

Implemented in:

```text
contracts/
```

Website/API wiring:

```text
/credits                    read-only contract status and gated wallet actions
/proof                      capacity-pool settlement snapshot section
/dashboard                  contract utility and capacity settlement panel
/api/contracts/status       public-safe contract config/status
/api/proof/capacity-settlements
```

Validation:

```text
npm run contracts:compile
npm run contracts:test
npm run contracts:security
```

`npm run contracts:security` adds the contract hardening lane: compile, full Hardhat tests, invariant-style accounting tests, and optional Slither static analysis. Use `npm run contracts:security:strict` on audit-prep or CI machines where Slither must be installed and must pass.

The contracts are prototypes only. They are not audited and must not be used with mainnet funds before security, legal, deployment, and incident-response work is complete.

## Reference Contracts

### Venice

Relevant Base contracts:

```text
VVV token:              0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf
Staking proxy:          0x321b7ff75154472B18EDb199033fF4D116F340Ff
StakingV2 implementation: 0xe37A7920dbc11253ac6d031C29f592f71B348DCA
DIEM token:             0xf4d97f2da56e8c3098f3a8D538DB630A2606a024
```

Venice mints VVV emissions because the staking proxy owns the VVV token. Fish cannot mint OCEAN, so the prototype replaces native minting with an optional funded `emissionSource`.

### AntSeed

Relevant Base contract:

```text
DiemStakingProxy: 0x1f228613116E2d08014DfdCC198377C8dedf18C9
```

Observed mechanics:

- Verified Solidity source.
- Locks DIEM into a capacity program.
- Stakes pooled DIEM into Venice's DIEM staking contract.
- Takes an operator fee from paid USDC settlement.
- Distributes net USDC pro-rata to DIEM stakers.
- Batches DIEM withdrawals through Venice's cooldown.
- Uses conservative public wording: allocations vary and may be zero.

AntSeed is tied to AntSeed channels, registry, deposits, and ANTS emissions. Fish should not copy those dependencies directly. The Fish prototype ports the capacity-pool accounting pattern and keeps Fish settlement inputs explicit.

## Prototype Contracts

```text
FishToken
  DIEM-style ERC20
  role-gated mint/burn
  stake / initiateUnstake / unstake cooldown

FishOceanStaking
  UUPS-compatible ERC1967 proxy target
  accepts OCEAN deposits
  mints non-transferable sOCEAN receipts
  locks sOCEAN to mint FISH through a 256-bucket curve
  burns FISH to unlock proportional sOCEAN
  optionally pulls OCEAN rewards from an emission source

FishCapacityPool
  accepts FISH from users
  stakes aggregate FISH into FishToken
  receives paid usage in USDC through an authorized operator
  takes operator fee
  distributes net USDC pro-rata to FISH capacity stakers
  batches FISH withdrawal through FishToken cooldown
```

## Economic Model

The default model avoids unfunded self-use:

```text
OCEAN holder locks OCEAN
-> mints FISH
-> stakes FISH into Fish Capacity Pool
-> paid users buy API/subscription usage
-> operator records paid USDC usage
-> net USDC is distributed to capacity stakers
```

This makes FISH a capacity/access token first, not a guarantee of free API credits.

Self-use should remain one of these:

- paid usage with FISH discount;
- FISH burn/spend per request;
- small capped promotional allowance;
- variable surplus allocation only when funded.

Fish should not promise fixed daily API credits unless there is a real funded reserve.

## Optional OceanDAO Emissions

The prototype supports an emission source:

```text
emissionSource approves FishOceanStaking to spend OCEAN
owner sets emissionRatePerSecond
staking update pulls OCEAN from emissionSource
stakers receive OCEAN rewards
treasury receives the configured protocol share
```

Default launch posture:

```text
emissionRatePerSecond = 0
```

If OceanDAO funds the emission wallet, then Fish can enable OCEAN rewards without modifying the contracts.

Important: if emissions are enabled and the source is not sufficiently funded or approved, reward-updating interactions can revert. Mainnet readiness needs monitoring, caps, and operating runbooks before emissions are enabled.

## Key Parameters

```text
FishOceanStaking.emissionRatePerSecond
  0 by default.
  Nonzero only when the emission source is funded and approved.

FishOceanStaking.protocolEmissionsPercentage
  0..1e18.
  Base treasury share of emissions.

FishOceanStaking.protocolEmissionsPercentageWhenLocked
  0..1e18.
  Extra treasury share from rewards attributable to locked sOCEAN.
  Prototype default: 20%.

FishOceanStaking.cooldownDuration
  OCEAN withdrawal delay after initiating unstake.
  Prototype default: 7 days.

FishOceanStaking.fishSupply / fishMintRates
  256-bucket FISH mint curve.
  `fishMintRates[i]` is sOCEAN required per FISH in 1e18 units.

FishToken.cooldownDuration
  FISH unstake delay.
  Prototype default: 1 day.

FishCapacityPool.operatorFeeBps
  Default: 1000 bps.
  Max: 2000 bps.

FishCapacityPool.maxTotalStake
  0 means uncapped.
  Nonzero caps FISH accepted into the capacity pool.
```

## Deployment Sketch

For testnet only:

```text
1. Confirm OCEAN token address for target chain.
2. Deploy FishToken with admin multisig/deployer.
3. Deploy FishOceanStaking implementation.
4. Deploy FishERC1967Proxy with initialize(OCEAN, FISH, treasury, emissionSource).
5. Grant FISH MINTER_BURNER_ROLE to the staking proxy.
6. Set FISH mint curve.
7. Deploy FishCapacityPool(FISH, USDC, operator).
8. Transfer admin/owner roles to multisig.
9. Keep emissions at 0 unless a funded source is ready.
10. Run stake, mint, burn, capacity settlement, and withdrawal tests on testnet.
```

## Website And Operator Wiring

The website reads contract addresses from `FISH_CONTRACT_*` environment variables and exposes them through `/api/contracts/status`.

Required addresses:

```text
FISH_CONTRACT_OCEAN_TOKEN_ADDRESS
FISH_CONTRACT_USDC_TOKEN_ADDRESS
FISH_CONTRACT_FISH_TOKEN_ADDRESS
FISH_CONTRACT_OCEAN_STAKING_ADDRESS
FISH_CONTRACT_CAPACITY_POOL_ADDRESS
```

Optional addresses:

```text
FISH_CONTRACT_TREASURY_ADDRESS
FISH_CONTRACT_EMISSION_SOURCE_ADDRESS
FISH_CONTRACT_OPERATOR_ADDRESS
```

Live onchain reads require:

```text
FISH_CONTRACT_RPC_URL
```

Wallet write actions are disabled unless:

```text
FISH_CONTRACT_ACTIONS_ENABLED=true
```

Server-side capacity settlement submission is disabled unless:

```text
FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true
FISH_CONTRACT_OPERATOR_PRIVATE_KEY=0x...
```

Base mainnet writes remain blocked unless:

```text
FISH_CONTRACT_MAINNET_WRITES_ALLOWED=true
```

The `/credits` action panel supports the full prototype testnet path:

```text
approve OCEAN
stake OCEAN
mint FISH
approve FISH
stake FISH capacity
claim USDC
queue FISH capacity exit
flush capacity batch
claim FISH batch
burn FISH
claim OCEAN rewards
start OCEAN exit
finish OCEAN exit
```

Capacity exits are batched. The user queues an amount, anyone can flush the current batch once it is ready, and the batch can be claimed after the FISH cooldown. OCEAN exits are separate: after FISH is burned to unlock sOCEAN, the user starts the OCEAN cooldown and finalizes after it ends.

Paid demand can be recorded for public proof through `POST /api/proof/capacity-settlements`. These records are operator-reported `snapshot` data until onchain verification is added.

When `submitOnchain=true`, the route requires an `idempotencyKey`, verifies the configured operator wallet against the capacity pool, approves USDC if needed, calls `recordPaidUsage`, waits for confirmations, and records the confirmed transaction hash as `live` settlement data.

Testnet deployment helper:

```bash
BASE_SEPOLIA_RPC_URL=https://... \
FISH_CONTRACT_DEPLOYER_PRIVATE_KEY=0x... \
npm run contracts:deploy:testnet
```

## Current Test Coverage

The local tests cover:

- OCEAN deposit and non-transferable sOCEAN receipt minting.
- FISH minting through the curve.
- FISH burn-to-unlock.
- OCEAN withdrawal after cooldown.
- zero-emission default.
- funded OCEAN emissions from an emission source.
- treasury cut from locked-stake emissions.
- FISH capacity staking.
- paid USDC usage settlement.
- operator fee.
- pro-rata USDC claims.
- batched FISH withdrawals through the FISH cooldown.
- `/api/contracts/status` exposes current and oldest capacity batch IDs plus `flushableAt` for wallet UX.

## Mainnet Blockers

- Security review and audit.
- Legal review for revenue allocation and token wording.
- Confirm canonical Base OCEAN address.
- Multisig ownership and role plan.
- Pause and incident response runbook.
- Emission-source funding monitor if emissions are enabled.
- Public terms modeled on conservative capacity-program language.
- UI must avoid guaranteed yield, guaranteed API credit, and passive-income phrasing.
- Decide how paid API/subscription demand is proven before `recordPaidUsage`.
- Decide whether revenue is card, USDC, or both before onchain settlement.

## Public Positioning

Use:

```text
Stake FISH into the Fish Capacity Pool.
Paid demand may create variable USDC allocations.
Allocations are not guaranteed and may be zero.
```

Avoid:

```text
guaranteed APY
passive income
risk-free API credits
fixed daily payout
staking alone pays providers
```
