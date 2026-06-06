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

The Docker Slither lane is intentionally strict: it exits nonzero while detector results remain. That is useful for audit-prep because it prevents accepted warnings from silently becoming CI green without an explicit suppression policy.

The first Docker pass found 25 detector results. This triage pass fixed or documented the easiest cleanup items and reduced the current report to 18 remaining design/accounting warnings.

## Fixed In This Pass

| Detector | Resolution |
| --- | --- |
| `uninitialized-local` | Explicitly initialized `FishOceanStaking._updateGlobalReward().oceanToStakers` to `0`. |
| `unindexed-event-address` | Indexed `TreasuryUpdated` and `EmissionSourceUpdated` address parameters. |
| `reentrancy-benign` | Moved capacity-pool unstake batch user mapping cleanup before the external `FishToken.unstake()` call while preserving payout transfers after the FISH cooldown exit. |
| `missing-zero-check` | Confirmed `emissionSource = address(0)` is intentional because it disables funded emissions. Added explicit comments, Slither suppressions for that detector only, and a regression test that clearing the source disables reward pulls. |
| `incorrect-equality` | Removed a redundant `emitted == 0` check from `_updateGlobalReward`; positive elapsed time and positive emission rate already imply a positive emission amount. |

## Remaining Findings

| Detector | Count | Triage | Rationale / Next Step |
| --- | ---: | --- | --- |
| `arbitrary-send-erc20` | 2 | Design risk, not a direct bug under current owner/upgrader trust model | `FishOceanStaking` pulls OCEAN from owner-configured `emissionSource` with `transferFrom`. This matches the funded-reserve prototype, but it means a compromised owner/upgrader could point emissions at any address that approved the staking contract. Mainnet posture should use a dedicated low-balance emission reserve, a multisig owner, and preferably a push-funded reward reserve design before real funds. |
| `divide-before-multiply` | 5 | Accepted precision behavior for prototype accounting | Reward and USDC distribution math floors fractional dust instead of over-distributing. Capacity-pool dust remains unreserved and sweepable as orphan USDC; OCEAN reward paths only pull amounts that are actually distributable. Keep invariant tests around reserved balances and reward-eligible supply. |
| `incorrect-equality` | 1 | Accepted sentinel check | `FishCapacityPool.flushableAt()` returns `0` when no batch is open. This is a view helper sentinel, not a value that gates asset movement. |
| `reentrancy-events` | 2 | Low risk with trusted FISH token, leave visible | Slither flags events emitted after `FishToken.mint()` / `FishToken.burn()`. The FISH token is the role-gated contract deployed for the system, has no callback hook, and staking state is updated before the calls. For mainnet-hardening, consider adding `ReentrancyGuardUpgradeable` or moving event emission before the external call if auditors prefer a clean detector report. |
| `timestamp` | 8 | Accepted cooldown/reward-clock mechanics | The timestamp uses implement staking cooldowns, FISH unstake cooldowns, batch-open timing, and linear reward accrual. They are not used for randomness or price selection. Validator timestamp skew can marginally affect cooldown/reward timing; document this as an economic assumption for launch readiness. |

## Mainnet Readiness Notes

Do not treat this Slither triage as an audit. Before mainnet or meaningful funds:

1. Replace or further constrain the pull-based `emissionSource` model.
2. Run strict Slither in CI and decide whether accepted warnings should be suppressed through an explicit policy file.
3. Add Foundry/Echidna-style fuzzing around reward math, cooldown exits, and capacity-pool batches.
4. Review upgradeability, owner/multisig controls, and deployment runbooks.
5. Get an independent Solidity audit.
