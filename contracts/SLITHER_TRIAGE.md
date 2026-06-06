# Slither Triage

Date: 2026-06-06

Scope:

```bash
npm run contracts:security:docker
```

Tooling:

- Docker image: `trailofbits/eth-security-toolbox:latest`
- Slither: `0.11.5`
- Contracts package: Hardhat compile plus Slither over `contracts/`

## Current Status

The Docker Slither lane is clean:

```text
INFO:Slither:. analyzed (40 contracts with 101 detectors), 0 result(s) found
```

The first Docker pass found 25 detector results. The first triage commit reduced that to 18. This pass eliminated the remaining findings through code changes plus targeted timestamp suppressions for intentional cooldown and reward-clock mechanics.

## Final Resolutions

| Detector | Resolution |
| --- | --- |
| `arbitrary-send-erc20` | Replaced reward-update `transferFrom(emissionSource, ...)` calls with a pre-funded reserve. The configured source now calls `fundEmissions(amount)` and reward updates allocate only from `emissionReserve`. |
| `divide-before-multiply` | Switched proportional reward, burn, and USDC distribution calculations to OpenZeppelin `Math.mulDiv`. |
| `incorrect-equality` | Removed the open-batch sentinel equality in `flushableAt()` and kept the helper as a non-asset-moving view. |
| `reentrancy-events` | Moved `FishMinted` and `FishBurned` event emission before the external `FishToken.mint()` / `FishToken.burn()` calls after staking state and reward debt are already updated. |
| `timestamp` | Added targeted Slither suppressions for cooldown, batch-open, and linear reward-accrual clocks. These timestamps are not randomness, price selection, authorization, or external data integrity inputs. |
| `uninitialized-local` | Explicitly initialized `FishOceanStaking._updateGlobalReward().oceanToStakers` to `0`. |
| `unindexed-event-address` | Indexed `TreasuryUpdated` and `EmissionSourceUpdated` address parameters. |
| `reentrancy-benign` | Moved capacity-pool unstake batch user mapping cleanup before the external `FishToken.unstake()` call while preserving payout transfers after the FISH cooldown exit. |
| `missing-zero-check` | Confirmed `emissionSource = address(0)` is intentional because it disables funded emissions. Added explicit comments, Slither suppressions for that detector only, and regression coverage that clearing the source disables reward allocation. |

## Reserve-Funding Invariants

The OCEAN emission path now has these invariants:

- Reward updates never pull OCEAN from an arbitrary approved wallet.
- Only the configured `emissionSource` can increase `emissionReserve`.
- If there is no reward-eligible supply, the reserve remains untouched.
- If the emission source is cleared to `address(0)`, existing reserve OCEAN remains unallocated.
- If the reserve is empty, reward allocation stops instead of reverting on an external allowance or balance.

## Mainnet Readiness Notes

Do not treat this Slither triage as an audit. Before mainnet or meaningful funds:

1. Run strict Slither in CI and keep accepted suppressions documented in code review.
2. Add Foundry/Echidna-style fuzzing around reward math, cooldown exits, and capacity-pool batches.
3. Review upgradeability, owner/multisig controls, and deployment runbooks.
4. Add reserve monitoring and funding alerts if emissions are enabled.
5. Get an independent Solidity audit.
