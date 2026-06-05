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

module.exports = {
  deploySystem,
  increaseTime,
  parse,
  parseUsdc
};
