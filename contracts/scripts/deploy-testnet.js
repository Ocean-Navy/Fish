const fs = require("node:fs/promises");
const path = require("node:path");
const { ethers, network } = require("hardhat");

const parse = ethers.parseEther;
const DEFAULT_TESTNET_FISH_COOLDOWN_SECONDS = 300;
const DEFAULT_TESTNET_OCEAN_COOLDOWN_SECONDS = 300;
const DEFAULT_TESTNET_MIN_UNSTAKE_BATCH_OPEN_SECONDS = 60;

async function main() {
  if (network.name === "base") {
    throw new Error("This script is for testnet deployment. Do not run it against Base mainnet.");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer configured. Set FISH_CONTRACT_DEPLOYER_PRIVATE_KEY.");
  }

  const treasury = addressEnv("FISH_CONTRACT_TREASURY_ADDRESS") || deployer.address;
  const emissionSource = addressEnv("FISH_CONTRACT_EMISSION_SOURCE_ADDRESS") || deployer.address;
  const operator = addressEnv("FISH_CONTRACT_OPERATOR_ADDRESS") || deployer.address;
  const ocean = await resolveToken({
    address: addressEnv("FISH_CONTRACT_OCEAN_TOKEN_ADDRESS"),
    name: "Test Ocean",
    symbol: "OCEAN",
    decimals: 18,
    deployer
  });
  const usdc = await resolveToken({
    address: addressEnv("FISH_CONTRACT_USDC_TOKEN_ADDRESS"),
    name: "Test USD Coin",
    symbol: "USDC",
    decimals: 6,
    deployer
  });

  const FishToken = await ethers.getContractFactory("FishToken");
  const fish = await FishToken.deploy(deployer.address);
  await fish.waitForDeployment();

  const Staking = await ethers.getContractFactory("FishOceanStaking");
  const stakingImpl = await Staking.deploy();
  await stakingImpl.waitForDeployment();
  const initData = Staking.interface.encodeFunctionData("initialize", [
    await ocean.contract.getAddress(),
    await fish.getAddress(),
    treasury,
    emissionSource
  ]);

  const Proxy = await ethers.getContractFactory("FishERC1967Proxy");
  const proxy = await Proxy.deploy(await stakingImpl.getAddress(), initData);
  await proxy.waitForDeployment();
  const staking = Staking.attach(await proxy.getAddress());

  const minterRole = await fish.MINTER_BURNER_ROLE();
  await (await fish.grantRole(minterRole, await staking.getAddress())).wait();

  const CapacityPool = await ethers.getContractFactory("FishCapacityPool");
  const capacityPool = await CapacityPool.deploy(await fish.getAddress(), await usdc.contract.getAddress(), operator);
  await capacityPool.waitForDeployment();

  await configureMintCurve(staking);
  const fishCooldownSeconds = secondsEnv("FISH_TESTNET_FISH_COOLDOWN_SECONDS", DEFAULT_TESTNET_FISH_COOLDOWN_SECONDS);
  const oceanCooldownSeconds = secondsEnv("FISH_TESTNET_OCEAN_COOLDOWN_SECONDS", DEFAULT_TESTNET_OCEAN_COOLDOWN_SECONDS);
  const minUnstakeBatchOpenSeconds = secondsEnv("FISH_TESTNET_MIN_UNSTAKE_BATCH_OPEN_SECONDS", DEFAULT_TESTNET_MIN_UNSTAKE_BATCH_OPEN_SECONDS);
  await (await fish.setCooldownDuration(fishCooldownSeconds)).wait();
  await (await staking.setCooldownDuration(oceanCooldownSeconds)).wait();
  await (await capacityPool.setMinUnstakeBatchOpenSecs(minUnstakeBatchOpenSeconds)).wait();

  if (ocean.deployed) {
    await (await ocean.contract.mint(deployer.address, parse("1000000"))).wait();
  }
  if (usdc.deployed) {
    await (await usdc.contract.mint(operator, ethers.parseUnits("1000000", 6))).wait();
  }

  const deployment = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury,
    emissionSource,
    operator,
    contracts: {
      oceanToken: await ocean.contract.getAddress(),
      usdcToken: await usdc.contract.getAddress(),
      fishToken: await fish.getAddress(),
      stakingImplementation: await stakingImpl.getAddress(),
      oceanStaking: await staking.getAddress(),
      capacityPool: await capacityPool.getAddress()
    },
    testTokens: {
      oceanTokenDeployed: ocean.deployed,
      usdcTokenDeployed: usdc.deployed
    },
    parameters: {
      fishCooldownSeconds,
      oceanCooldownSeconds,
      minUnstakeBatchOpenSeconds
    }
  };

  await writeLocalDeployment(deployment);
  printEnv(deployment);
}

async function resolveToken({ address, decimals, deployer, name, symbol }) {
  if (address) {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    return {
      deployed: false,
      contract: TestERC20.attach(address)
    };
  }

  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const contract = await TestERC20.deploy(name, symbol, decimals);
  await contract.waitForDeployment();
  return {
    deployed: true,
    contract: contract.connect(deployer)
  };
}

async function configureMintCurve(staking) {
  const supply = new Array(256).fill(0n);
  const rates = new Array(256).fill(0n);
  supply[0] = parse("100000");
  rates[0] = parse("10");
  supply[1] = parse("500000");
  rates[1] = parse("20");
  supply[2] = parse("1000000");
  rates[2] = parse("40");
  await (await staking.setFishMintCurve(supply, rates)).wait();
}

function addressEnv(name) {
  const value = process.env[name]?.trim();
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : null;
}

function secondsEnv(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

async function writeLocalDeployment(deployment) {
  const dir = path.join(__dirname, "..", "deployments");
  await fs.mkdir(dir, { recursive: true });
  const safeTimestamp = deployment.deployedAt.replaceAll(":", "-");
  await fs.writeFile(path.join(dir, `${deployment.network}-${safeTimestamp}.local.json`), `${JSON.stringify(deployment, null, 2)}\n`);
}

function printEnv(deployment) {
  const explorer =
    deployment.chainId === 84532
      ? "https://sepolia.basescan.org"
      : deployment.chainId === 8453
        ? "https://basescan.org"
        : "";

  console.log("\nDeployment complete. Add these to the web app env for testing:\n");
  console.log(`FISH_CONTRACT_CHAIN_ID=${deployment.chainId}`);
  console.log(`FISH_CONTRACT_CHAIN_NAME=${deployment.network}`);
  console.log(`FISH_CONTRACT_EXPLORER_URL=${explorer}`);
  if (process.env.BASE_SEPOLIA_RPC_URL || process.env.FISH_CONTRACT_RPC_URL) {
    console.log(`FISH_CONTRACT_RPC_URL=${process.env.BASE_SEPOLIA_RPC_URL || process.env.FISH_CONTRACT_RPC_URL}`);
  }
  console.log(`FISH_CONTRACT_OCEAN_TOKEN_ADDRESS=${deployment.contracts.oceanToken}`);
  console.log(`FISH_CONTRACT_USDC_TOKEN_ADDRESS=${deployment.contracts.usdcToken}`);
  console.log(`FISH_CONTRACT_FISH_TOKEN_ADDRESS=${deployment.contracts.fishToken}`);
  console.log(`FISH_CONTRACT_OCEAN_STAKING_ADDRESS=${deployment.contracts.oceanStaking}`);
  console.log(`FISH_CONTRACT_CAPACITY_POOL_ADDRESS=${deployment.contracts.capacityPool}`);
  console.log(`FISH_CONTRACT_TREASURY_ADDRESS=${deployment.treasury}`);
  console.log(`FISH_CONTRACT_EMISSION_SOURCE_ADDRESS=${deployment.emissionSource}`);
  console.log(`FISH_CONTRACT_OPERATOR_ADDRESS=${deployment.operator}`);
  console.log("FISH_CONTRACT_ACTIONS_ENABLED=true");
  console.log("FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true");
  console.log("\nTestnet cooldowns used:");
  console.log(`FISH cooldown: ${deployment.parameters.fishCooldownSeconds}s`);
  console.log(`OCEAN cooldown: ${deployment.parameters.oceanCooldownSeconds}s`);
  console.log(`Capacity batch open: ${deployment.parameters.minUnstakeBatchOpenSeconds}s`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
