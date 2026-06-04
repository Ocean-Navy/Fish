// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

interface IFishStake {
    function stake(uint256 amount) external;
    function initiateUnstake(uint256 amount) external;
    function unstake() external;
    function cooldownDuration() external view returns (uint256);
}

/// @title FishCapacityPool
/// @notice AntSeed-inspired FISH capacity pool for paid demand.
/// @dev This contract is deliberately simpler than AntSeed's channel facade:
/// an authorized operator records settled paid demand in USDC, the operator fee
/// is taken, and the net amount is distributed pro-rata to FISH capacity stakers.
contract FishCapacityPool is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    uint256 public constant DEFAULT_OPERATOR_FEE_BPS = 1000;
    uint256 public constant MAX_OPERATOR_FEE_BPS = 2000;
    uint256 public constant BPS = 10_000;
    uint256 public constant RAY = 1e27;

    uint32 public constant MAX_PER_UNSTAKE_BATCH = 50;
    uint64 public constant DEFAULT_MIN_UNSTAKE_BATCH_OPEN_SECS = 1 days;
    uint64 public constant MAX_MIN_UNSTAKE_BATCH_OPEN_SECS = 7 days;

    IERC20 public immutable fish;
    IERC20 public immutable usdc;

    uint256 public totalStaked;
    uint256 public maxTotalStake;
    uint32 public stakerCount;
    mapping(address => uint256) public staked;

    uint256 public usdcRewardPerTokenStored;
    mapping(address => uint256) public userUsdcRewardPerTokenPaid;
    mapping(address => uint256) public usdcRewards;
    uint256 public totalUsdcReservedForStakers;
    uint256 public totalUsdcDistributedEver;

    mapping(address => bool) public isOperator;
    uint256 public operatorFeeBps;
    address public operatorFeeRecipient;

    struct UnstakeBatch {
        uint128 total;
        uint64 unlockAt;
        uint32 userCount;
        bool claimed;
    }

    mapping(uint32 => UnstakeBatch) public unstakeBatches;
    mapping(uint32 => address[]) public unstakeBatchUsers;
    mapping(uint32 => mapping(address => uint128)) public unstakeBatchUserAmount;
    uint32 public currentUnstakeBatch;
    uint32 public oldestUnclaimedUnstakeBatch;
    uint64 public currentUnstakeBatchOpenedAt;
    uint64 public minUnstakeBatchOpenSecs;

    event OperatorSet(address indexed operator, bool enabled);
    event OperatorFeeSet(uint256 feeBps, address indexed recipient);
    event Staked(address indexed user, uint256 amount);
    event UnstakeQueued(address indexed user, uint32 indexed batchId, uint256 amount);
    event UnstakeBatchFlushed(uint32 indexed batchId, uint256 total, uint256 unlockAt);
    event UnstakeBatchClaimed(uint32 indexed batchId, uint256 total, uint32 userCount);
    event Unstaked(address indexed user, uint256 amount);
    event PaidUsageRecorded(address indexed operator, uint256 grossAmount, uint256 operatorFee, uint256 netAmount);
    event UsdcDistributed(uint256 amount);
    event UsdcPaid(address indexed user, uint256 amount);
    event OrphanUsdcSwept(address indexed recipient, uint256 amount);
    event MaxTotalStakeSet(uint256 newMaxTotalStake);
    event MinUnstakeBatchOpenSecsSet(uint64 newMinUnstakeBatchOpenSecs);

    error InvalidAddress();
    error InvalidAmount();
    error InsufficientStake();
    error UnstakeBatchFull();
    error NothingToFlush();
    error PriorUnstakeBatchUnclaimed();
    error UnstakeBatchNotReady();
    error UnstakeBatchAlreadyClaimed();
    error UnstakeBatchTooYoung();
    error NothingToClaim();
    error MaxStakeExceeded();
    error MinUnstakeBatchOpenSecsTooLarge();
    error NotOperator();
    error OperatorFeeTooLarge();

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    modifier updateRewards(address account) {
        _updateUsdcForUser(account);
        _;
    }

    constructor(address fish_, address usdc_, address initialOperator) Ownable(msg.sender) {
        if (fish_ == address(0) || usdc_ == address(0) || initialOperator == address(0)) revert InvalidAddress();
        fish = IERC20(fish_);
        usdc = IERC20(usdc_);

        currentUnstakeBatch = 1;
        oldestUnclaimedUnstakeBatch = 1;
        minUnstakeBatchOpenSecs = DEFAULT_MIN_UNSTAKE_BATCH_OPEN_SECS;

        operatorFeeBps = DEFAULT_OPERATOR_FEE_BPS;
        operatorFeeRecipient = initialOperator;
        isOperator[initialOperator] = true;

        emit OperatorFeeSet(DEFAULT_OPERATOR_FEE_BPS, initialOperator);
        emit OperatorSet(initialOperator, true);
        emit MinUnstakeBatchOpenSecsSet(DEFAULT_MIN_UNSTAKE_BATCH_OPEN_SECS);
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused updateRewards(msg.sender) {
        if (amount == 0) revert InvalidAmount();
        uint256 cap = maxTotalStake;
        if (cap != 0 && totalStaked + amount > cap) revert MaxStakeExceeded();

        if (staked[msg.sender] == 0) stakerCount += 1;
        staked[msg.sender] += amount;
        totalStaked += amount;

        fish.safeTransferFrom(msg.sender, address(this), amount);
        IFishStake(address(fish)).stake(amount);

        emit Staked(msg.sender, amount);
    }

    function initiateUnstake(uint256 amount) external nonReentrant whenNotPaused updateRewards(msg.sender) {
        if (amount == 0) revert InvalidAmount();
        if (amount > staked[msg.sender]) revert InsufficientStake();

        uint32 batchId = currentUnstakeBatch;
        UnstakeBatch storage batch = unstakeBatches[batchId];

        if (batch.total == 0) currentUnstakeBatchOpenedAt = uint64(block.timestamp);

        uint128 existing = unstakeBatchUserAmount[batchId][msg.sender];
        if (existing == 0) {
            if (batch.userCount >= MAX_PER_UNSTAKE_BATCH) revert UnstakeBatchFull();
            unstakeBatchUsers[batchId].push(msg.sender);
            batch.userCount += 1;
        }

        staked[msg.sender] -= amount;
        totalStaked -= amount;
        if (staked[msg.sender] == 0) stakerCount -= 1;

        uint128 amount128 = amount.toUint128();
        unstakeBatchUserAmount[batchId][msg.sender] = existing + amount128;
        batch.total += amount128;

        emit UnstakeQueued(msg.sender, batchId, amount);
    }

    function flush() external nonReentrant whenNotPaused {
        if (currentUnstakeBatch != oldestUnclaimedUnstakeBatch) revert PriorUnstakeBatchUnclaimed();

        uint32 batchId = currentUnstakeBatch;
        UnstakeBatch storage batch = unstakeBatches[batchId];
        if (batch.total == 0) revert NothingToFlush();

        uint64 openedAt = currentUnstakeBatchOpenedAt;
        if (
            batch.userCount < MAX_PER_UNSTAKE_BATCH
                && block.timestamp < uint256(openedAt) + uint256(minUnstakeBatchOpenSecs)
        ) {
            revert UnstakeBatchTooYoung();
        }

        uint256 cooldown = IFishStake(address(fish)).cooldownDuration();
        uint64 unlockAt = (block.timestamp + cooldown).toUint64();
        batch.unlockAt = unlockAt;

        currentUnstakeBatch = batchId + 1;
        currentUnstakeBatchOpenedAt = 0;

        IFishStake(address(fish)).initiateUnstake(batch.total);

        emit UnstakeBatchFlushed(batchId, batch.total, unlockAt);
    }

    function claimUnstakeBatch(uint32 batchId) external nonReentrant {
        UnstakeBatch storage batch = unstakeBatches[batchId];
        if (batch.unlockAt == 0 || block.timestamp < batch.unlockAt) revert UnstakeBatchNotReady();
        if (batch.claimed) revert UnstakeBatchAlreadyClaimed();

        batch.claimed = true;
        if (batchId == oldestUnclaimedUnstakeBatch) oldestUnclaimedUnstakeBatch = batchId + 1;

        IFishStake(address(fish)).unstake();

        address[] storage users = unstakeBatchUsers[batchId];
        uint256 count = users.length;
        for (uint256 i = 0; i < count; i++) {
            address user = users[i];
            uint128 amount = unstakeBatchUserAmount[batchId][user];
            delete unstakeBatchUserAmount[batchId][user];
            fish.safeTransfer(user, amount);
            emit Unstaked(user, amount);
        }

        emit UnstakeBatchClaimed(batchId, batch.total, uint32(count));
    }

    function recordPaidUsage(uint256 grossAmount) external nonReentrant whenNotPaused onlyOperator {
        if (grossAmount == 0) revert InvalidAmount();

        usdc.safeTransferFrom(msg.sender, address(this), grossAmount);
        uint256 fee = (grossAmount * operatorFeeBps) / BPS;
        if (fee > 0) usdc.safeTransfer(operatorFeeRecipient, fee);
        uint256 netAmount = grossAmount - fee;
        _distributeUsdcInstant(netAmount);

        emit PaidUsageRecorded(msg.sender, grossAmount, fee, netAmount);
    }

    function claimUsdc() external nonReentrant whenNotPaused updateRewards(msg.sender) {
        uint256 owed = usdcRewards[msg.sender];
        if (owed == 0) revert NothingToClaim();

        usdcRewards[msg.sender] = 0;
        totalUsdcReservedForStakers -= owed;
        usdc.safeTransfer(msg.sender, owed);

        emit UsdcPaid(msg.sender, owed);
    }

    function earnedUsdc(address account) external view returns (uint256) {
        return usdcRewards[account]
            + ((staked[account] * (usdcRewardPerTokenStored - userUsdcRewardPerTokenPaid[account])) / RAY);
    }

    function flushableAt() external view returns (uint64) {
        uint64 openedAt = currentUnstakeBatchOpenedAt;
        if (openedAt == 0) return 0;
        return openedAt + minUnstakeBatchOpenSecs;
    }

    function setOperator(address operator, bool enabled) external onlyOwner {
        if (operator == address(0)) revert InvalidAddress();
        isOperator[operator] = enabled;
        emit OperatorSet(operator, enabled);
    }

    function setOperatorFee(uint256 feeBps, address recipient) external onlyOwner {
        if (feeBps > MAX_OPERATOR_FEE_BPS) revert OperatorFeeTooLarge();
        if (feeBps > 0 && recipient == address(0)) revert InvalidAddress();
        operatorFeeBps = feeBps;
        operatorFeeRecipient = recipient;
        emit OperatorFeeSet(feeBps, recipient);
    }

    function setMaxTotalStake(uint256 newMaxTotalStake) external onlyOwner {
        maxTotalStake = newMaxTotalStake;
        emit MaxTotalStakeSet(newMaxTotalStake);
    }

    function setMinUnstakeBatchOpenSecs(uint64 newMinUnstakeBatchOpenSecs) external onlyOwner {
        if (newMinUnstakeBatchOpenSecs > MAX_MIN_UNSTAKE_BATCH_OPEN_SECS) {
            revert MinUnstakeBatchOpenSecsTooLarge();
        }
        minUnstakeBatchOpenSecs = newMinUnstakeBatchOpenSecs;
        emit MinUnstakeBatchOpenSecsSet(newMinUnstakeBatchOpenSecs);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function sweepOrphanUsdc(address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 balance = usdc.balanceOf(address(this));
        uint256 reserved = totalUsdcReservedForStakers;
        if (balance <= reserved) return;

        uint256 amount = balance - reserved;
        usdc.safeTransfer(recipient, amount);
        emit OrphanUsdcSwept(recipient, amount);
    }

    function _distributeUsdcInstant(uint256 amount) internal {
        if (amount == 0 || totalStaked == 0) return;

        uint256 rewardPerTokenDelta = (amount * RAY) / totalStaked;
        if (rewardPerTokenDelta == 0) return;

        usdcRewardPerTokenStored += rewardPerTokenDelta;
        uint256 distributable = (rewardPerTokenDelta * totalStaked) / RAY;
        totalUsdcReservedForStakers += distributable;
        totalUsdcDistributedEver += distributable;

        emit UsdcDistributed(distributable);
    }

    function _updateUsdcForUser(address account) internal {
        uint256 delta = (staked[account] * (usdcRewardPerTokenStored - userUsdcRewardPerTokenPaid[account])) / RAY;
        if (delta > 0) usdcRewards[account] += delta;
        userUsdcRewardPerTokenPaid[account] = usdcRewardPerTokenStored;
    }
}
