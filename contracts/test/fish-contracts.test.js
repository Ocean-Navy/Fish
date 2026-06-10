const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploySystem, increaseTime, parse, parseUsdc } = require("./helpers/fishSystem");

describe("Fish OCEAN staking and capacity pool", function () {
  it("locks OCEAN, mints FISH, burns FISH, and unlocks OCEAN with zero emissions", async function () {
    const { holder, ocean, fish, staking } = await deploySystem();

    await ocean.connect(holder).approve(await staking.getAddress(), parse("100"));
    await staking.connect(holder).stake(holder.address, parse("100"));

    await expect(staking.connect(holder).mintFish(parse("50"), 0))
      .to.emit(staking, "FishMinted")
      .withArgs(holder.address, parse("50"), parse("5"));

    expect(await fish.balanceOf(holder.address)).to.equal(parse("5"));
    expect(await staking.balanceOfUnlocked(holder.address)).to.equal(parse("50"));

    await expect(staking.connect(holder).initiateUnstake(parse("51"))).to.be.revertedWithCustomError(
      staking,
      "InsufficientBalance"
    );

    await fish.connect(holder).approve(await staking.getAddress(), parse("5"));
    await expect(staking.connect(holder).burnFish(parse("5")))
      .to.emit(staking, "FishBurned")
      .withArgs(holder.address, parse("50"), parse("5"));
    expect(await fish.balanceOf(holder.address)).to.equal(0n);
    expect((await staking.lockedStakes(holder.address)).sOceanLockedAmount).to.equal(0n);

    await staking.connect(holder).initiateUnstake(parse("100"));
    await increaseTime(61);
    await staking.connect(holder).finalizeUnstake();
    expect(await ocean.balanceOf(holder.address)).to.equal(parse("10000"));
  });

  it("keeps emissionReserve appended after legacy staking storage slots", async function () {
    const { emissionSource, ocean, staking } = await deploySystem();
    const stakingAddress = await staking.getAddress();

    expect(await ethers.provider.getStorage(stakingAddress, 12)).to.equal(ethers.toBeHex(parse("1000"), 32));
    expect(await ethers.provider.getStorage(stakingAddress, 268)).to.equal(ethers.toBeHex(parse("10"), 32));
    expect(await ethers.provider.getStorage(stakingAddress, 526)).to.equal(ethers.ZeroHash);

    await ocean.connect(emissionSource).approve(stakingAddress, parse("42"));
    await staking.connect(emissionSource).fundEmissions(parse("42"));

    expect(await staking.emissionReserve()).to.equal(parse("42"));
    expect(await ethers.provider.getStorage(stakingAddress, 12)).to.equal(ethers.toBeHex(parse("1000"), 32));
    expect(await ethers.provider.getStorage(stakingAddress, 268)).to.equal(ethers.toBeHex(parse("10"), 32));
    expect(await ethers.provider.getStorage(stakingAddress, 526)).to.equal(ethers.toBeHex(parse("42"), 32));
  });

  it("does not allocate pre-funded emissions when no user has staked", async function () {
    const { operator, emissionSource, ocean, staking } = await deploySystem();
    const stakingAddress = await staking.getAddress();

    expect(await staking.totalSupply()).to.equal(0n);
    expect(await staking.balanceOf(stakingAddress)).to.equal(0n);

    await ocean.connect(emissionSource).approve(stakingAddress, parse("1000"));
    await staking.connect(emissionSource).fundEmissions(parse("1000"));
    await staking.setEmissionRate(parse("1"));
    await increaseTime(100);

    await staking.connect(operator).claim();

    expect(await ocean.balanceOf(emissionSource.address)).to.equal(parse("9000"));
    expect(await ocean.balanceOf(stakingAddress)).to.equal(parse("1000"));
    expect(await staking.emissionReserve()).to.equal(parse("1000"));
    expect(await staking.pendingRewards(operator.address)).to.equal(0n);
  });

  it("keeps OCEAN emissions disabled by default and distributes from a pre-funded reserve", async function () {
    const { holder, holderTwo, treasury, emissionSource, ocean, fish, staking } = await deploySystem();
    const stakingAddress = await staking.getAddress();

    await ocean.connect(holder).approve(stakingAddress, parse("1000"));
    await ocean.connect(holderTwo).approve(stakingAddress, parse("1000"));
    await staking.connect(holder).stake(holder.address, parse("1000"));
    await staking.connect(holderTwo).stake(holderTwo.address, parse("1000"));
    await staking.connect(holder).mintFish(parse("500"), 0);

    await increaseTime(7 * 24 * 60 * 60);
    await staking.connect(holder).claim();
    expect(await ocean.balanceOf(treasury.address)).to.equal(0n);

    await ocean.connect(emissionSource).approve(stakingAddress, parse("1000"));
    await expect(staking.connect(emissionSource).fundEmissions(parse("1000")))
      .to.emit(staking, "EmissionReserveFunded")
      .withArgs(emissionSource.address, parse("1000"));
    await staking.setEmissionRate(parse("1"));
    await increaseTime(100);

    await staking.connect(holder).claim();
    await staking.connect(holderTwo).claim();

    expect(await ocean.balanceOf(emissionSource.address)).to.equal(parse("9000"));
    expect(await ocean.balanceOf(treasury.address)).to.be.gt(0n);
    expect(await ocean.balanceOf(stakingAddress)).to.be.gt(parse("2000"));
    expect(await staking.emissionReserve()).to.be.lt(parse("1000"));
    expect(await fish.balanceOf(holder.address)).to.equal(parse("50"));
  });

  it("distributes paid usage USDC to FISH capacity stakers after operator fee", async function () {
    const { holder, holderTwo, operator, usdc, fish, ocean, staking, capacityPool } = await deploySystem();

    await ocean.connect(holder).approve(await staking.getAddress(), parse("100"));
    await ocean.connect(holderTwo).approve(await staking.getAddress(), parse("100"));
    await staking.connect(holder).stake(holder.address, parse("100"));
    await staking.connect(holderTwo).stake(holderTwo.address, parse("100"));
    await staking.connect(holder).mintFish(parse("100"), 0);
    await staking.connect(holderTwo).mintFish(parse("100"), 0);

    await fish.connect(holder).approve(await capacityPool.getAddress(), parse("10"));
    await fish.connect(holderTwo).approve(await capacityPool.getAddress(), parse("10"));
    await capacityPool.connect(holder).stake(parse("10"));
    await capacityPool.connect(holderTwo).stake(parse("10"));

    await usdc.connect(operator).approve(await capacityPool.getAddress(), parseUsdc("100"));
    await expect(capacityPool.connect(operator).recordPaidUsage(parseUsdc("100")))
      .to.emit(capacityPool, "PaidUsageRecorded")
      .withArgs(operator.address, parseUsdc("100"), parseUsdc("10"), parseUsdc("90"));

    expect(await capacityPool.earnedUsdc(holder.address)).to.equal(parseUsdc("45"));
    expect(await capacityPool.earnedUsdc(holderTwo.address)).to.equal(parseUsdc("45"));

    await capacityPool.connect(holder).claimUsdc();
    expect(await usdc.balanceOf(holder.address)).to.equal(parseUsdc("45"));
    expect(await usdc.balanceOf(operator.address)).to.equal(parseUsdc("9910"));
  });

  it("uses batched FISH withdrawals from the capacity pool through FishToken cooldown", async function () {
    const { holder, ocean, fish, staking, capacityPool } = await deploySystem();

    await ocean.connect(holder).approve(await staking.getAddress(), parse("100"));
    await staking.connect(holder).stake(holder.address, parse("100"));
    await staking.connect(holder).mintFish(parse("100"), 0);

    await fish.connect(holder).approve(await capacityPool.getAddress(), parse("10"));
    await capacityPool.connect(holder).stake(parse("10"));
    expect(await fish.balanceOf(holder.address)).to.equal(0n);

    await capacityPool.connect(holder).initiateUnstake(parse("10"));
    await increaseTime(61);
    await capacityPool.flush();
    await increaseTime(61);
    await capacityPool.claimUnstakeBatch(1);

    expect(await fish.balanceOf(holder.address)).to.equal(parse("10"));
  });
});
