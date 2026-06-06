// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {FishToken} from "./FishToken.sol";

/// @title FishOceanStaking
/// @notice Venice StakingV2-inspired OCEAN lock and FISH minting prototype.
/// @dev The key compatibility change from Venice is that OCEAN rewards are
/// allocated from a pre-funded reserve instead of minting OCEAN.
contract FishOceanStaking is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant ACC_REWARD_SCALE = 1e36;
    uint256 public constant PERCENT_SCALE = 1e18;

    IERC20 public ocean;
    FishToken public fish;
    address public treasury;
    address public emissionSource;

    uint256 public emissionRatePerSecond;
    uint256 public cooldownDuration;
    uint256 public lastRewardTimestamp;
    uint256 public accRewardPerShare;
    uint256 public accRewardPerShareLocked;
    uint256 public protocolEmissionsPercentage;
    uint256 public protocolEmissionsPercentageWhenLocked;
    uint256 public totalLockedStakedOcean;
    uint256 public emissionReserve;

    uint256[256] public fishSupply;
    uint256[256] public fishMintRates;

    struct StakeInfo {
        uint256 rewardDebt;
        uint256 cooldownEnd;
        uint256 cooldownAmount;
    }

    struct LockedStakeInfo {
        uint256 sOceanLockedAmount;
        uint256 outstandingFishAmount;
    }

    mapping(address => StakeInfo) public stakes;
    mapping(address => LockedStakeInfo) public lockedStakes;

    event Staked(address indexed user, uint256 amount);
    event UnstakeInitiated(address indexed user, uint256 amount);
    event UnstakeFinalized(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event FishMinted(uint256 sOceanLocked, uint256 fishMinted);
    event FishBurned(uint256 sOceanUnlocked, uint256 fishBurned);
    event TreasuryUpdated(address indexed newTreasury);
    event EmissionSourceUpdated(address indexed newEmissionSource);
    event EmissionReserveFunded(address indexed funder, uint256 amount);
    event EmissionRateUpdated(uint256 newEmissionRate);
    event CooldownDurationUpdated(uint256 newCooldownDuration);
    event ProtocolEmissionsPercentageUpdated(uint256 newPercentage);
    event ProtocolEmissionsPercentageWhenLockedUpdated(uint256 newPercentage);
    event FishMintRatesUpdated(uint256[256] fishSupply, uint256[256] fishMintRates);

    error InvalidAddress();
    error InvalidPercentage();
    error StakeZero();
    error UnstakeZero();
    error LockZero();
    error BurnZero();
    error InsufficientBalance();
    error InsufficientSupply();
    error InsufficientOutstandingFish();
    error InsufficientLockedBalance();
    error CooldownInProgress();
    error CooldownNotOver();
    error NoCooldown();
    error MinAmountOut();
    error NonTransferable();
    error FundingZero();
    error InvalidEmissionFunder();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address ocean_, address fish_, address treasury_, address emissionSource_) external initializer {
        if (ocean_ == address(0) || fish_ == address(0) || treasury_ == address(0)) revert InvalidAddress();

        __ERC20_init("Staked OCEAN", "sOCEAN");
        __Ownable_init(msg.sender);

        ocean = IERC20(ocean_);
        fish = FishToken(fish_);
        treasury = treasury_;
        // Optional: address(0) explicitly disables funded OCEAN rewards.
        // slither-disable-next-line missing-zero-check
        emissionSource = emissionSource_;
        cooldownDuration = 7 days;
        protocolEmissionsPercentageWhenLocked = 2e17;
        // slither-disable-next-line timestamp
        lastRewardTimestamp = block.timestamp;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setEmissionSource(address newEmissionSource) external onlyOwner {
        // Optional: address(0) explicitly disables funded OCEAN rewards.
        // slither-disable-next-line missing-zero-check
        emissionSource = newEmissionSource;
        emit EmissionSourceUpdated(newEmissionSource);
    }

    function fundEmissions(uint256 amount) external {
        if (amount == 0) revert FundingZero();
        address source = emissionSource;
        if (source == address(0) || msg.sender != source) revert InvalidEmissionFunder();

        ocean.safeTransferFrom(msg.sender, address(this), amount);
        emissionReserve += amount;
        emit EmissionReserveFunded(msg.sender, amount);
    }

    function setEmissionRate(uint256 newEmissionRate) external onlyOwner {
        _updateGlobalReward();
        emissionRatePerSecond = newEmissionRate;
        emit EmissionRateUpdated(newEmissionRate);
    }

    function setCooldownDuration(uint256 newCooldownDuration) external onlyOwner {
        cooldownDuration = newCooldownDuration;
        emit CooldownDurationUpdated(newCooldownDuration);
    }

    function setProtocolEmissionsPercentage(uint256 newPercentage) external onlyOwner {
        if (newPercentage > PERCENT_SCALE) revert InvalidPercentage();
        _updateGlobalReward();
        protocolEmissionsPercentage = newPercentage;
        emit ProtocolEmissionsPercentageUpdated(newPercentage);
    }

    function setProtocolEmissionsPercentageWhenLocked(uint256 newPercentage) external onlyOwner {
        if (newPercentage > PERCENT_SCALE) revert InvalidPercentage();
        _updateGlobalReward();
        protocolEmissionsPercentageWhenLocked = newPercentage;
        emit ProtocolEmissionsPercentageWhenLockedUpdated(newPercentage);
    }

    function setFishMintCurve(uint256[256] calldata newFishSupply, uint256[256] calldata newFishMintRates)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < 256; i++) {
            fishSupply[i] = newFishSupply[i];
            fishMintRates[i] = newFishMintRates[i];
        }

        emit FishMintRatesUpdated(newFishSupply, newFishMintRates);
    }

    function stake(address recipient, uint256 amount) public {
        if (amount == 0) revert StakeZero();
        _claim(recipient);
        _mint(recipient, amount);
        ocean.safeTransferFrom(msg.sender, address(this), amount);
        stakes[recipient].rewardDebt = _getRewardDebt(recipient);
        emit Staked(recipient, amount);
    }

    function initiateUnstake(uint256 amount) external {
        if (amount == 0) revert UnstakeZero();
        StakeInfo storage stakeInfo = stakes[msg.sender];
        if (stakeInfo.cooldownAmount != 0) revert CooldownInProgress();
        if (balanceOfUnlocked(msg.sender) < amount) revert InsufficientBalance();

        _claim(msg.sender);
        _burn(msg.sender, amount);

        // slither-disable-next-line timestamp
        stakeInfo.cooldownEnd = block.timestamp + cooldownDuration;
        stakeInfo.cooldownAmount = amount;
        stakeInfo.rewardDebt = _getRewardDebt(msg.sender);

        emit UnstakeInitiated(msg.sender, amount);
    }

    function finalizeUnstake() external {
        StakeInfo storage stakeInfo = stakes[msg.sender];
        if (stakeInfo.cooldownAmount == 0) revert NoCooldown();
        // slither-disable-next-line timestamp
        if (block.timestamp < stakeInfo.cooldownEnd) revert CooldownNotOver();

        uint256 amount = stakeInfo.cooldownAmount;
        stakeInfo.cooldownEnd = 0;
        stakeInfo.cooldownAmount = 0;
        ocean.safeTransfer(msg.sender, amount);

        emit UnstakeFinalized(msg.sender, amount);
    }

    function claim() external {
        _claim(msg.sender);
        stakes[msg.sender].rewardDebt = _getRewardDebt(msg.sender);
    }

    function mintFish(uint256 sOceanAmountToLock, uint256 minFishAmountOut) external {
        if (sOceanAmountToLock == 0) revert LockZero();
        _claim(msg.sender);
        if (balanceOfUnlocked(msg.sender) < sOceanAmountToLock) revert InsufficientBalance();

        uint256 fishAmountOut = getFishAmountOut(sOceanAmountToLock);
        if (fishAmountOut < minFishAmountOut) revert MinAmountOut();

        LockedStakeInfo storage lockedStake = lockedStakes[msg.sender];
        lockedStake.outstandingFishAmount += fishAmountOut;
        lockedStake.sOceanLockedAmount += sOceanAmountToLock;
        totalLockedStakedOcean += sOceanAmountToLock;

        stakes[msg.sender].rewardDebt = _getRewardDebt(msg.sender);
        emit FishMinted(sOceanAmountToLock, fishAmountOut);
        fish.mint(msg.sender, fishAmountOut);
    }

    function burnFish(uint256 fishAmountToBurn) external {
        if (fishAmountToBurn == 0) revert BurnZero();
        if (fish.balanceOf(msg.sender) < fishAmountToBurn) revert InsufficientBalance();
        LockedStakeInfo storage lockedStake = lockedStakes[msg.sender];
        if (lockedStake.outstandingFishAmount == 0) revert InsufficientOutstandingFish();

        _claim(msg.sender);

        uint256 sOceanToUnlock =
            Math.mulDiv(fishAmountToBurn, lockedStake.sOceanLockedAmount, lockedStake.outstandingFishAmount);
        if (lockedStake.sOceanLockedAmount < sOceanToUnlock) revert InsufficientLockedBalance();

        lockedStake.sOceanLockedAmount -= sOceanToUnlock;
        if (lockedStake.outstandingFishAmount < fishAmountToBurn) revert InsufficientOutstandingFish();
        lockedStake.outstandingFishAmount -= fishAmountToBurn;
        totalLockedStakedOcean -= sOceanToUnlock;

        stakes[msg.sender].rewardDebt = _getRewardDebt(msg.sender);
        emit FishBurned(sOceanToUnlock, fishAmountToBurn);
        fish.burn(msg.sender, fishAmountToBurn);
    }

    function getFishAmountOut(uint256 sOceanAmountToLock) public view returns (uint256 fishAmountOut) {
        uint256 currentFishSupply = fish.totalSupply();
        uint256 sOceanRemainingToLock = sOceanAmountToLock;

        for (uint256 i = 0; i < 256; i++) {
            if (currentFishSupply >= fishSupply[i]) continue;

            uint256 supplyUpperBound = fishSupply[i];
            uint256 bucketMintRate = fishMintRates[i];
            if (bucketMintRate == 0) continue;

            uint256 fishAvailableInBucket = supplyUpperBound - currentFishSupply;
            uint256 sOceanAvailableInBucket = ((bucketMintRate * fishAvailableInBucket) + (1e18 - 1)) / 1e18;

            if (sOceanAvailableInBucket >= sOceanRemainingToLock) {
                fishAmountOut += (sOceanRemainingToLock * 1e18) / bucketMintRate;
                sOceanRemainingToLock = 0;
                break;
            }

            fishAmountOut += fishAvailableInBucket;
            sOceanRemainingToLock -= sOceanAvailableInBucket;
            currentFishSupply += fishAvailableInBucket;
        }

        if (sOceanRemainingToLock > 0) revert InsufficientSupply();
    }

    function pendingRewards(address user) public view returns (uint256) {
        uint256 localAccRewardPerShare = accRewardPerShare;
        uint256 localAccRewardPerShareLocked = accRewardPerShareLocked;

        // slither-disable-next-line timestamp
        if (block.timestamp > lastRewardTimestamp && emissionRatePerSecond > 0) {
            // slither-disable-next-line timestamp
            uint256 timeElapsed = block.timestamp - lastRewardTimestamp;
            uint256 emitted = _availableEmissionForElapsed(timeElapsed);
            uint256 protocolPortion = Math.mulDiv(emitted, protocolEmissionsPercentage, PERCENT_SCALE);
            uint256 rawStakerPortion = emitted - protocolPortion;
            uint256 rewardSupply = _rewardEligibleSupply();

            if (rewardSupply > 0 && rawStakerPortion > 0) {
                uint256 stakerPortionLocked = Math.mulDiv(rawStakerPortion, totalLockedStakedOcean, rewardSupply);
                uint256 stakerPortionUnlocked = rawStakerPortion - stakerPortionLocked;
                uint256 totalUnlockedSupply = rewardSupply - totalLockedStakedOcean;

                if (stakerPortionUnlocked > 0 && totalUnlockedSupply > 0) {
                    localAccRewardPerShare += Math.mulDiv(stakerPortionUnlocked, ACC_REWARD_SCALE, totalUnlockedSupply);
                }

                if (stakerPortionLocked > 0 && totalLockedStakedOcean > 0) {
                    uint256 protocolPortionLocked =
                        Math.mulDiv(stakerPortionLocked, protocolEmissionsPercentageWhenLocked, PERCENT_SCALE);
                    uint256 stakerPortionLockedForRewards = stakerPortionLocked - protocolPortionLocked;
                    localAccRewardPerShareLocked +=
                        Math.mulDiv(stakerPortionLockedForRewards, ACC_REWARD_SCALE, totalLockedStakedOcean);
                }
            }
        }

        uint256 userAccumulated = Math.mulDiv(balanceOfUnlocked(user), localAccRewardPerShare, ACC_REWARD_SCALE);
        uint256 userAccumulatedLocked =
            Math.mulDiv(lockedStakes[user].sOceanLockedAmount, localAccRewardPerShareLocked, ACC_REWARD_SCALE);
        return userAccumulated + userAccumulatedLocked - stakes[user].rewardDebt;
    }

    function balanceOfUnlocked(address user) public view returns (uint256) {
        return balanceOf(user) - lockedStakes[user].sOceanLockedAmount;
    }

    // slither-disable-start timestamp
    function _claim(address user) internal {
        _updateGlobalReward();
        uint256 pending = pendingRewards(user);
        if (pending > 0) {
            ocean.safeTransfer(user, pending);
            emit Claimed(user, pending);
        }
    }
    // slither-disable-end timestamp

    function _updateGlobalReward() internal {
        // slither-disable-next-line timestamp
        if (block.timestamp <= lastRewardTimestamp) return;

        // slither-disable-next-line timestamp
        uint256 timeElapsed = block.timestamp - lastRewardTimestamp;
        // slither-disable-next-line timestamp
        lastRewardTimestamp = block.timestamp;

        if (emissionRatePerSecond == 0) return;
        if (emissionSource == address(0)) return;

        uint256 emitted = _availableEmissionForElapsed(timeElapsed);

        uint256 protocolPortion = Math.mulDiv(emitted, protocolEmissionsPercentage, PERCENT_SCALE);
        uint256 rawStakerPortion = emitted - protocolPortion;
        uint256 rewardSupply = _rewardEligibleSupply();
        if (rewardSupply == 0) return;

        uint256 totalUnlockedSupply = rewardSupply - totalLockedStakedOcean;
        uint256 stakerPortionLocked = Math.mulDiv(rawStakerPortion, totalLockedStakedOcean, rewardSupply);
        uint256 stakerPortionUnlocked = rawStakerPortion - stakerPortionLocked;
        uint256 oceanToStakers = 0;

        if (stakerPortionUnlocked > 0 && totalUnlockedSupply > 0) {
            uint256 stakerRewardDelta = Math.mulDiv(stakerPortionUnlocked, ACC_REWARD_SCALE, totalUnlockedSupply);
            if (stakerRewardDelta > 0) {
                uint256 distributed = Math.mulDiv(stakerRewardDelta, totalUnlockedSupply, ACC_REWARD_SCALE);
                accRewardPerShare += stakerRewardDelta;
                oceanToStakers += distributed;
            }
        }

        if (stakerPortionLocked > 0 && totalLockedStakedOcean > 0) {
            uint256 protocolPortionLocked = Math.mulDiv(stakerPortionLocked, protocolEmissionsPercentageWhenLocked, PERCENT_SCALE);
            uint256 stakerPortionLockedForRewards = stakerPortionLocked - protocolPortionLocked;
            uint256 lockedStakerRewardDelta =
                Math.mulDiv(stakerPortionLockedForRewards, ACC_REWARD_SCALE, totalLockedStakedOcean);
            if (lockedStakerRewardDelta > 0) {
                uint256 distributedToLockedStakers =
                    Math.mulDiv(lockedStakerRewardDelta, totalLockedStakedOcean, ACC_REWARD_SCALE);
                accRewardPerShareLocked += lockedStakerRewardDelta;
                oceanToStakers += distributedToLockedStakers;
            }
            protocolPortion += protocolPortionLocked;
        }

        uint256 allocated = protocolPortion + oceanToStakers;
        if (allocated > 0) emissionReserve -= allocated;
        if (protocolPortion > 0) ocean.safeTransfer(treasury, protocolPortion);
    }

    // slither-disable-start timestamp
    function _availableEmissionForElapsed(uint256 timeElapsed) internal view returns (uint256) {
        if (emissionSource == address(0)) return 0;
        uint256 emitted = timeElapsed * emissionRatePerSecond;
        uint256 reserve = emissionReserve;
        return emitted < reserve ? emitted : reserve;
    }
    // slither-disable-end timestamp

    function _rewardEligibleSupply() internal view returns (uint256) {
        return totalSupply() - balanceOf(address(this));
    }

    function _getRewardDebt(address user) internal view returns (uint256) {
        uint256 userAccumulated = Math.mulDiv(balanceOfUnlocked(user), accRewardPerShare, ACC_REWARD_SCALE);
        uint256 userAccumulatedLocked =
            Math.mulDiv(lockedStakes[user].sOceanLockedAmount, accRewardPerShareLocked, ACC_REWARD_SCALE);
        return userAccumulated + userAccumulatedLocked;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert NonTransferable();
        super._update(from, to, value);
    }
}
