// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title FishToken
/// @notice DIEM-style token for the Fish prototype.
/// @dev Close to Venice's Diem.sol: mint/burn are role-gated, and holders can
/// stake the token into the token contract with a cooldown before withdrawal.
contract FishToken is ERC20, AccessControl {
    bytes32 public constant MINTER_BURNER_ROLE = keccak256("MINTER_BURNER_ROLE");

    uint256 public cooldownDuration = 1 days;
    uint256 public totalStaked;

    struct StakedInfo {
        uint256 amountStaked;
        uint256 coolDownEnd;
        uint256 coolDownAmount;
    }

    mapping(address => StakedInfo) public stakedInfos;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event UnstakeInitiated(address indexed user, uint256 amount);
    event CooldownDurationUpdated(uint256 cooldownDuration);

    error StakeZero();
    error UnstakeZero();
    error InsufficientBalance();
    error InsufficientStakedBalance();
    error NoCooldown();
    error CooldownNotOver();

    constructor(address admin) ERC20("Fish", "FISH") {
        require(admin != address(0), "admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_BURNER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(MINTER_BURNER_ROLE) {
        _burn(from, amount);
    }

    function setCooldownDuration(uint256 newCooldownDuration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        cooldownDuration = newCooldownDuration;
        emit CooldownDurationUpdated(newCooldownDuration);
    }

    function stake(uint256 amount) external {
        if (amount == 0) revert StakeZero();
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();

        totalStaked += amount;
        stakedInfos[msg.sender].amountStaked += amount;
        _update(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    function initiateUnstake(uint256 amount) external {
        if (amount == 0) revert UnstakeZero();
        StakedInfo storage stakedInfo = stakedInfos[msg.sender];
        if (stakedInfo.amountStaked < amount) revert InsufficientStakedBalance();

        stakedInfo.coolDownEnd = block.timestamp + cooldownDuration;
        stakedInfo.coolDownAmount += amount;
        stakedInfo.amountStaked -= amount;

        emit UnstakeInitiated(msg.sender, amount);
    }

    function unstake() external {
        StakedInfo storage stakedInfo = stakedInfos[msg.sender];
        if (stakedInfo.coolDownAmount == 0) revert NoCooldown();
        if (block.timestamp < stakedInfo.coolDownEnd) revert CooldownNotOver();

        uint256 amount = stakedInfo.coolDownAmount;
        totalStaked -= amount;
        stakedInfo.coolDownAmount = 0;
        stakedInfo.coolDownEnd = 0;
        _update(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }
}
