require("@nomicfoundation/hardhat-toolbox");

const deployerPrivateKey = process.env.FISH_CONTRACT_DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || process.env.FISH_CONTRACT_RPC_URL || "http://127.0.0.1:8545",
      accounts
    },
    base: {
      url: process.env.BASE_RPC_URL || process.env.FISH_CONTRACT_RPC_URL || "http://127.0.0.1:8545",
      accounts
    }
  }
};
