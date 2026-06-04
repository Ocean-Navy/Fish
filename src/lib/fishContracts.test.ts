import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { summarizeFishContracts } from "./fishContracts";

const CONTRACT_ENV_KEYS = [
  "FISH_CONTRACT_ACTIONS_ENABLED",
  "FISH_CONTRACT_CAPACITY_POOL_ADDRESS",
  "FISH_CONTRACT_CHAIN_ID",
  "FISH_CONTRACT_CHAIN_NAME",
  "FISH_CONTRACT_FISH_TOKEN_ADDRESS",
  "FISH_CONTRACT_MAINNET_WRITES_ALLOWED",
  "FISH_CONTRACT_OCEAN_STAKING_ADDRESS",
  "FISH_CONTRACT_OCEAN_TOKEN_ADDRESS",
  "FISH_CONTRACT_OPERATOR_PRIVATE_KEY",
  "FISH_CONTRACT_RPC_URL",
  "FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED",
  "FISH_CONTRACT_USDC_TOKEN_ADDRESS",
  "NEXT_PUBLIC_FISH_CONTRACT_ACTIONS_ENABLED"
] as const;

const ADDRESS_ONE = "0x1111111111111111111111111111111111111111";
const ADDRESS_TWO = "0x2222222222222222222222222222222222222222";
const ADDRESS_THREE = "0x3333333333333333333333333333333333333333";
const ADDRESS_FOUR = "0x4444444444444444444444444444444444444444";
const ADDRESS_FIVE = "0x5555555555555555555555555555555555555555";

afterEach(() => {
  clearContractEnv();
});

test("contract status is unavailable when required addresses are missing", async () => {
  clearContractEnv();

  const status = await summarizeFishContracts();

  assert.equal(status.dataState, "unavailable");
  assert.equal(status.mode, "local_prototype");
  assert.equal(status.deployment.requiredConfigured, false);
  assert.equal(status.walletActionGate.writesAllowed, false);
  assert.equal(status.onchain.readVerified, false);
});

test("testnet writes are enabled only after required addresses and action gate are configured", async () => {
  configureRequiredContracts({ chainId: "84532", actionsEnabled: "true" });

  const status = await summarizeFishContracts();
  const actionIds = status.actions.map((action) => action.id);

  assert.equal(status.dataState, "snapshot");
  assert.equal(status.mode, "testnet_actions");
  assert.equal(status.deployment.requiredConfigured, true);
  assert.equal(status.walletActionGate.writesAllowed, true);
  assert.equal(status.settlementSubmitGate.submitAllowed, false);
  assert.equal(status.onchain.sourceState, "snapshot");
  assert.equal(status.onchain.capacityPool.currentUnstakeBatch, null);
  assert.deepEqual(actionIds, [
    "approve_ocean",
    "stake_ocean",
    "mint_fish",
    "burn_fish",
    "claim_ocean_rewards",
    "initiate_ocean_unstake",
    "finalize_ocean_unstake",
    "approve_fish",
    "stake_capacity",
    "initiate_capacity_unstake",
    "flush_capacity_batch",
    "claim_capacity_batch",
    "claim_usdc"
  ]);
});

test("Base mainnet writes stay blocked unless the explicit mainnet override is set", async () => {
  configureRequiredContracts({ chainId: "8453", actionsEnabled: "true" });

  const status = await summarizeFishContracts();

  assert.equal(status.deployment.requiredConfigured, true);
  assert.equal(status.mode, "mainnet_read_only");
  assert.equal(status.walletActionGate.writesAllowed, false);
  assert.match(status.walletActionGate.reason, /mainnet/i);
});

function configureRequiredContracts({ actionsEnabled, chainId }: { actionsEnabled: string; chainId: string }) {
  clearContractEnv();
  process.env.FISH_CONTRACT_CHAIN_ID = chainId;
  process.env.FISH_CONTRACT_ACTIONS_ENABLED = actionsEnabled;
  process.env.FISH_CONTRACT_OCEAN_TOKEN_ADDRESS = ADDRESS_ONE;
  process.env.FISH_CONTRACT_FISH_TOKEN_ADDRESS = ADDRESS_TWO;
  process.env.FISH_CONTRACT_OCEAN_STAKING_ADDRESS = ADDRESS_THREE;
  process.env.FISH_CONTRACT_CAPACITY_POOL_ADDRESS = ADDRESS_FOUR;
  process.env.FISH_CONTRACT_USDC_TOKEN_ADDRESS = ADDRESS_FIVE;
}

function clearContractEnv() {
  for (const key of CONTRACT_ENV_KEYS) {
    delete process.env[key];
  }
}
