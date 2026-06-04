const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const parse = ethers.parseEther;
const parseUsdc = (value) => ethers.parseUnits(value, 6);

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function deploySystem() {
  const [owner, treasury, emissionSource, holder, holderTwo, operator, payer] = await ethers.getSigners();

  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const ocean = await TestERC20.deploy("Ocean", "OCEAN", 18);
  const usdc = await TestERC20.deploy("USD Coin", "USDC", 6);

  const FishToken = await ethers.getContractFactory("FishToken");
  const fish = await FishToken.deploy(owner.address);

  const Staking = await ethers.getContractFactory("FishOceanStaking");
  const stakingImpl = await Staking.deploy();
  const initData = Staking.interface.encodeFunctionData("initialize", [
    await ocean.getAddress(),
    await fish.getAddress(),
    treasury.address,
    emissionSource.address
  ]);

  const Proxy = await ethers.getContractFactory("FishERC1967Proxy");
  const proxy = await Proxy.deploy(await stakingImpl.getAddress(), initData);
  const staking = Staking.attach(await proxy.getAddress());

  const minterRole = await fish.MINTER_BURNER_ROLE();
  await fish.grantRole(minterRole, await staking.getAddress());

  const CapacityPool = await ethers.getContractFactory("FishCapacityPool");
  const capacityPool = await CapacityPool.deploy(await fish.getAddress(), await usdc.getAddress(), operator.address);

  await ocean.mint(holder.address, parse("10000"));
  await ocean.mint(holderTwo.address, parse("10000"));
  await ocean.mint(emissionSource.address, parse("10000"));
  await usdc.mint(operator.address, parseUsdc("10000"));
  await usdc.mint(payer.address, parseUsdc("10000"));

  await fish.setCooldownDuration(60);
  await staking.setCooldownDuration(60);
  await capacityPool.setMinUnstakeBatchOpenSecs(60);

  const supply = new Array(256).fill(0n);
  const rates = new Array(256).fill(0n);
  supply[0] = parse("1000");
  rates[0] = parse("10");
  supply[1] = parse("2000");
  rates[1] = parse("20");
  await staking.setFishMintCurve(supply, rates);

  return {
    owner,
    treasury,
    emissionSource,
    holder,
    holderTwo,
    operator,
    payer,
    ocean,
    usdc,
    fish,
    staking,
    capacityPool
  };
}

describe("Fish OCEAN staking and capacity pool", function () {
  it("locks OCEAN, mints FISH, burns FISH, and unlocks OCEAN with zero emissions", async function () {
    const { holder, ocean, fish, staking } = await deploySystem();

    await ocean.connect(holder).approve(await staking.getAddress(), parse("100"));
    await staking.connect(holder).stake(holder.address, parse("100"));

    await expect(staking.connect(holder).mintFish(parse("50"), 0))
      .to.emit(staking, "FishMinted")
      .withArgs(parse("50"), parse("5"));

    expect(await fish.balanceOf(holder.address)).to.equal(parse("5"));
    expect(await staking.balanceOfUnlocked(holder.address)).to.equal(parse("50"));

    await expect(staking.connect(holder).initiateUnstake(parse("51"))).to.be.revertedWithCustomError(
      staking,
      "InsufficientBalance"
    );

    await fish.connect(holder).approve(await staking.getAddress(), parse("5"));
    await staking.connect(holder).burnFish(parse("5"));
    expect(await fish.balanceOf(holder.address)).to.equal(0n);
    expect((await staking.lockedStakes(holder.address)).sOceanLockedAmount).to.equal(0n);

    await staking.connect(holder).initiateUnstake(parse("100"));
    await increaseTime(61);
    await staking.connect(holder).finalizeUnstake();
    expect(await ocean.balanceOf(holder.address)).to.equal(parse("10000"));
  });

  it("keeps OCEAN emissions disabled by default and can pull funded emissions from a reserve wallet", async function () {
    const { holder, holderTwo, treasury, emissionSource, ocean, fish, staking } = await deploySystem();

    await ocean.connect(holder).approve(await staking.getAddress(), parse("1000"));
    await ocean.connect(holderTwo).approve(await staking.getAddress(), parse("1000"));
    await staking.connect(holder).stake(holder.address, parse("1000"));
    await staking.connect(holderTwo).stake(holderTwo.address, parse("1000"));
    await staking.connect(holder).mintFish(parse("500"), 0);

    await increaseTime(7 * 24 * 60 * 60);
    await staking.connect(holder).claim();
    expect(await ocean.balanceOf(treasury.address)).to.equal(0n);

    await ocean.connect(emissionSource).approve(await staking.getAddress(), parse("1000"));
    await staking.setEmissionRate(parse("1"));
    await increaseTime(100);

    await staking.connect(holder).claim();
    await staking.connect(holderTwo).claim();

    expect(await ocean.balanceOf(treasury.address)).to.be.gt(0n);
    expect(await ocean.balanceOf(await staking.getAddress())).to.be.gt(parse("2000"));
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
