const { expect } = require("chai");
const { deploySystem, increaseTime, parse, parseUsdc } = require("./helpers/fishSystem");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function expectOceanStakingInvariants(staking, fish, accounts) {
  let lockedTotal = 0n;
  let outstandingFishTotal = 0n;

  for (const account of accounts) {
    const locked = await staking.lockedStakes(account.address);
    const balance = await staking.balanceOf(account.address);
    const unlocked = await staking.balanceOfUnlocked(account.address);

    expect(locked.sOceanLockedAmount).to.be.lte(balance);
    expect(unlocked + locked.sOceanLockedAmount).to.equal(balance);

    lockedTotal += locked.sOceanLockedAmount;
    outstandingFishTotal += locked.outstandingFishAmount;
  }

  expect(await staking.totalLockedStakedOcean()).to.equal(lockedTotal);
  expect(lockedTotal).to.be.lte(await staking.totalSupply());
  expect(await fish.totalSupply()).to.be.gte(outstandingFishTotal);
}

async function expectCapacityPoolInvariants(capacityPool, fish, usdc) {
  const poolAddress = await capacityPool.getAddress();
  const stakedInFishToken = (await fish.stakedInfos(poolAddress)).amountStaked;
  const queuedBatch = await capacityPool.unstakeBatches(await capacityPool.currentUnstakeBatch());
  const reservedUsdc = await capacityPool.totalUsdcReservedForStakers();

  expect(await capacityPool.totalStaked()).to.be.lte(await fish.balanceOf(poolAddress) + stakedInFishToken);
  expect(queuedBatch.total).to.be.lte(stakedInFishToken);
  expect(reservedUsdc).to.be.lte(await usdc.balanceOf(poolAddress));
}

describe("Fish contract security invariants", function () {
  it("preserves OCEAN staking lock and FISH debt invariants through deterministic mint/burn operations", async function () {
    const { holder, holderTwo, ocean, fish, staking } = await deploySystem();
    const users = [holder, holderTwo];

    await ocean.connect(holder).approve(await staking.getAddress(), parse("1000"));
    await ocean.connect(holderTwo).approve(await staking.getAddress(), parse("1000"));
    await staking.connect(holder).stake(holder.address, parse("1000"));
    await staking.connect(holderTwo).stake(holderTwo.address, parse("700"));
    await expectOceanStakingInvariants(staking, fish, users);

    await staking.connect(holder).mintFish(parse("250"), 0);
    await staking.connect(holderTwo).mintFish(parse("180"), 0);
    await expectOceanStakingInvariants(staking, fish, users);

    await fish.connect(holder).approve(await staking.getAddress(), parse("10"));
    await staking.connect(holder).burnFish(parse("10"));
    await expectOceanStakingInvariants(staking, fish, users);

    await staking.connect(holderTwo).mintFish(parse("90"), 0);
    await expectOceanStakingInvariants(staking, fish, users);
  });

  it("does not create emissions, treasury transfers, or pending rewards without reward-eligible supply", async function () {
    const { operator, treasury, emissionSource, ocean, staking } = await deploySystem();
    const stakingAddress = await staking.getAddress();

    await ocean.connect(emissionSource).approve(stakingAddress, parse("5000"));
    await staking.connect(emissionSource).fundEmissions(parse("5000"));
    await staking.setEmissionRate(parse("2"));

    for (let i = 0; i < 5; i++) {
      await increaseTime(30);
      await staking.connect(operator).claim();
      expect(await ocean.balanceOf(emissionSource.address)).to.equal(parse("5000"));
      expect(await ocean.balanceOf(treasury.address)).to.equal(0n);
      expect(await ocean.balanceOf(stakingAddress)).to.equal(parse("5000"));
      expect(await staking.emissionReserve()).to.equal(parse("5000"));
      expect(await staking.pendingRewards(operator.address)).to.equal(0n);
    }
  });

  it("allows the operator to clear the optional emission source to disable funded rewards", async function () {
    const { holder, treasury, emissionSource, ocean, staking } = await deploySystem();
    const stakingAddress = await staking.getAddress();

    await ocean.connect(holder).approve(stakingAddress, parse("100"));
    await staking.connect(holder).stake(holder.address, parse("100"));
    await ocean.connect(emissionSource).approve(stakingAddress, parse("1000"));
    await staking.connect(emissionSource).fundEmissions(parse("1000"));
    await staking.setEmissionRate(parse("1"));
    await staking.setEmissionSource(ZERO_ADDRESS);
    await increaseTime(100);

    await staking.connect(holder).claim();

    expect(await ocean.balanceOf(emissionSource.address)).to.equal(parse("9000"));
    expect(await ocean.balanceOf(treasury.address)).to.equal(0n);
    expect(await ocean.balanceOf(stakingAddress)).to.equal(parse("1100"));
    expect(await staking.emissionReserve()).to.equal(parse("1000"));
    expect(await staking.pendingRewards(holder.address)).to.equal(0n);
  });

  it("keeps capacity-pool USDC reserves backed and unavailable to orphan sweeping", async function () {
    const { holder, holderTwo, operator, treasury, ocean, usdc, fish, staking, capacityPool } = await deploySystem();
    const poolAddress = await capacityPool.getAddress();

    for (const user of [holder, holderTwo]) {
      await ocean.connect(user).approve(await staking.getAddress(), parse("200"));
      await staking.connect(user).stake(user.address, parse("200"));
      await staking.connect(user).mintFish(parse("100"), 0);
      await fish.connect(user).approve(poolAddress, parse("10"));
      await capacityPool.connect(user).stake(parse("10"));
    }

    await usdc.connect(operator).approve(poolAddress, parseUsdc("300"));
    await capacityPool.connect(operator).recordPaidUsage(parseUsdc("100"));
    await expectCapacityPoolInvariants(capacityPool, fish, usdc);

    await usdc.mint(poolAddress, parseUsdc("5"));
    const reservedBeforeSweep = await capacityPool.totalUsdcReservedForStakers();
    await capacityPool.sweepOrphanUsdc(treasury.address);

    expect(await capacityPool.totalUsdcReservedForStakers()).to.equal(reservedBeforeSweep);
    expect(await usdc.balanceOf(poolAddress)).to.equal(reservedBeforeSweep);

    await capacityPool.connect(holder).claimUsdc();
    await capacityPool.connect(holderTwo).claimUsdc();
    expect(await capacityPool.totalUsdcReservedForStakers()).to.equal(0n);
    await expectCapacityPoolInvariants(capacityPool, fish, usdc);
  });

  it("enforces role and operator boundaries on security-sensitive contract controls", async function () {
    const { holder, holderTwo, operator, emissionSource, ocean, usdc, fish, staking, capacityPool } =
      await deploySystem();
    const poolAddress = await capacityPool.getAddress();

    await expect(staking.connect(holder).setEmissionRate(parse("1"))).to.be.revertedWithCustomError(
      staking,
      "OwnableUnauthorizedAccount"
    );
    await expect(staking.connect(emissionSource).fundEmissions(0)).to.be.revertedWithCustomError(
      staking,
      "FundingZero"
    );
    await expect(staking.connect(holder).fundEmissions(parse("1"))).to.be.revertedWithCustomError(
      staking,
      "InvalidEmissionFunder"
    );
    await expect(capacityPool.connect(holder).setOperator(holder.address, true)).to.be.revertedWithCustomError(
      capacityPool,
      "OwnableUnauthorizedAccount"
    );
    await expect(capacityPool.connect(holder).recordPaidUsage(parseUsdc("1"))).to.be.revertedWithCustomError(
      capacityPool,
      "NotOperator"
    );

    await ocean.connect(holder).approve(await staking.getAddress(), parse("100"));
    await staking.connect(holder).stake(holder.address, parse("100"));
    await staking.connect(holder).mintFish(parse("100"), 0);
    await fish.connect(holder).approve(poolAddress, parse("10"));
    await capacityPool.connect(holder).stake(parse("10"));

    await usdc.connect(operator).approve(poolAddress, parseUsdc("10"));
    await capacityPool.connect(operator).recordPaidUsage(parseUsdc("10"));
    await expect(capacityPool.connect(holderTwo).sweepOrphanUsdc(holderTwo.address)).to.be.revertedWithCustomError(
      capacityPool,
      "OwnableUnauthorizedAccount"
    );
  });

  it("preserves user principal through full OCEAN stake, FISH mint/burn, and cooldown exit", async function () {
    const { holder, holderTwo, ocean, fish, staking } = await deploySystem();
    const users = [holder, holderTwo];

    for (const user of users) {
      await ocean.connect(user).approve(await staking.getAddress(), parse("500"));
      await staking.connect(user).stake(user.address, parse("500"));
      await staking.connect(user).mintFish(parse("300"), 0);
    }
    await expectOceanStakingInvariants(staking, fish, users);

    for (const user of users) {
      const outstandingFish = (await staking.lockedStakes(user.address)).outstandingFishAmount;
      await fish.connect(user).approve(await staking.getAddress(), outstandingFish);
      await staking.connect(user).burnFish(outstandingFish);
      await staking.connect(user).initiateUnstake(parse("500"));
    }

    await increaseTime(61);
    await staking.connect(holder).finalizeUnstake();
    await staking.connect(holderTwo).finalizeUnstake();

    expect(await ocean.balanceOf(holder.address)).to.equal(parse("10000"));
    expect(await ocean.balanceOf(holderTwo.address)).to.equal(parse("10000"));
    expect(await staking.totalSupply()).to.equal(0n);
    expect(await staking.totalLockedStakedOcean()).to.equal(0n);
    expect(await fish.totalSupply()).to.equal(0n);
  });
});
