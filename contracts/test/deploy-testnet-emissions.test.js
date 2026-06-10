const { expect } = require("chai");
const { ethers } = require("hardhat");
const { increaseTime, parse } = require("./helpers/fishSystem");
const { main: deployTestnet } = require("../scripts/deploy-testnet.js");

// Env that deploy-testnet.js reads. Cleared per run so a dev shell's exports
// can't leak into the deterministic test deployments.
const DEPLOY_ENV_KEYS = [
  "FISH_CONTRACT_TREASURY_ADDRESS",
  "FISH_CONTRACT_EMISSION_SOURCE_ADDRESS",
  "FISH_CONTRACT_OPERATOR_ADDRESS",
  "FISH_CONTRACT_OCEAN_TOKEN_ADDRESS",
  "FISH_CONTRACT_USDC_TOKEN_ADDRESS",
  "FISH_TESTNET_FISH_COOLDOWN_SECONDS",
  "FISH_TESTNET_OCEAN_COOLDOWN_SECONDS",
  "FISH_TESTNET_MIN_UNSTAKE_BATCH_OPEN_SECONDS",
  "FISH_TESTNET_FUND_EMISSIONS",
  "FISH_TESTNET_EMISSION_RATE_PER_SECOND",
  "FISH_TESTNET_EMISSION_FUND_AMOUNT"
];

async function runDeploy(overrides = {}) {
  const saved = {};
  for (const key of DEPLOY_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  try {
    return await deployTestnet({ silent: true, writeDeployment: false });
  } finally {
    for (const key of DEPLOY_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe("deploy-testnet emission funding (FISH_TESTNET_FUND_EMISSIONS)", function () {
  it("funds emissions when the flag is on: pendingRewards accrue and claim() pays OCEAN", async function () {
    const deployment = await runDeploy({
      FISH_TESTNET_FUND_EMISSIONS: "true",
      FISH_TESTNET_EMISSION_RATE_PER_SECOND: "1",
      FISH_TESTNET_EMISSION_FUND_AMOUNT: "1000"
    });

    expect(deployment.emissionFunding).to.not.equal(null);
    expect(deployment.emissionFunding.emissionReserve).to.equal(parse("1000").toString());

    const [deployer] = await ethers.getSigners();
    const staking = await ethers.getContractAt("FishOceanStaking", deployment.contracts.oceanStaking);
    const ocean = await ethers.getContractAt("TestERC20", deployment.contracts.oceanToken);

    expect(await staking.emissionRatePerSecond()).to.equal(parse("1"));
    expect(await staking.emissionReserve()).to.equal(parse("1000"));

    await ocean.approve(deployment.contracts.oceanStaking, parse("100"));
    await staking.stake(deployer.address, parse("100"));
    await increaseTime(100);

    expect(await staking.pendingRewards(deployer.address)).to.be.gt(0n);

    const balanceBefore = await ocean.balanceOf(deployer.address);
    await staking.claim();
    expect(await ocean.balanceOf(deployer.address)).to.be.gt(balanceBefore);
    expect(await staking.emissionReserve()).to.be.lt(parse("1000"));
  });

  it("keeps rewards zero when the flag is off (unfunded deploys stay zero by design)", async function () {
    const deployment = await runDeploy();

    expect(deployment.emissionFunding).to.equal(null);

    const [deployer] = await ethers.getSigners();
    const staking = await ethers.getContractAt("FishOceanStaking", deployment.contracts.oceanStaking);
    const ocean = await ethers.getContractAt("TestERC20", deployment.contracts.oceanToken);

    expect(await staking.emissionRatePerSecond()).to.equal(0n);
    expect(await staking.emissionReserve()).to.equal(0n);

    await ocean.approve(deployment.contracts.oceanStaking, parse("100"));
    await staking.stake(deployer.address, parse("100"));
    await increaseTime(100);

    expect(await staking.pendingRewards(deployer.address)).to.equal(0n);

    const balanceBefore = await ocean.balanceOf(deployer.address);
    await staking.claim();
    expect(await ocean.balanceOf(deployer.address)).to.equal(balanceBefore);
    expect(await staking.emissionReserve()).to.equal(0n);
  });

  it("rejects funding when the emission source is not the deployer", async function () {
    let error = null;
    try {
      await runDeploy({
        FISH_TESTNET_FUND_EMISSIONS: "true",
        FISH_CONTRACT_EMISSION_SOURCE_ADDRESS: "0x000000000000000000000000000000000000dEaD"
      });
    } catch (caught) {
      error = caught;
    }
    expect(error, "expected deploy to reject").to.not.equal(null);
    expect(error.message).to.include("requires the emission source to be the deployer");
  });
});
