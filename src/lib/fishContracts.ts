import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Chain, Hex, PublicClient } from "viem";
import type { DataState } from "@/lib/types";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_USDC_ADDRESS = "0x833589fcD6EDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_RPC_TIMEOUT_MS = 4000;
const DEFAULT_CONFIRMATIONS = 1;
const OCEAN_STAKING_BOOTSTRAP_SOCEAN_SUPPLY = 1_000_000_000_000_000_000n;

const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }
] as const;

const OCEAN_STAKING_ABI = [
  { type: "function", name: "cooldownDuration", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "emissionRatePerSecond", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalLockedStakedOcean", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }
] as const;

const CAPACITY_POOL_ABI = [
  { type: "function", name: "currentUnstakeBatch", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint32" }] },
  { type: "function", name: "flushableAt", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "isOperator", stateMutability: "view", inputs: [{ name: "operator", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "oldestUnclaimedUnstakeBatch", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint32" }] },
  { type: "function", name: "operatorFeeBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "recordPaidUsage", stateMutability: "nonpayable", inputs: [{ name: "grossAmount", type: "uint256" }], outputs: [] },
  { type: "function", name: "stakerCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint32" }] },
  { type: "function", name: "totalStaked", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalUsdcDistributedEver", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalUsdcReservedForStakers", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }
] as const;

type ContractAddressKey = "oceanToken" | "fishToken" | "oceanStaking" | "capacityPool" | "usdcToken" | "treasury" | "emissionSource" | "operator";
export type FishContractActionId =
  | "approve_ocean"
  | "stake_ocean"
  | "mint_fish"
  | "burn_fish"
  | "claim_ocean_rewards"
  | "initiate_ocean_unstake"
  | "finalize_ocean_unstake"
  | "approve_fish"
  | "stake_capacity"
  | "initiate_capacity_unstake"
  | "flush_capacity_batch"
  | "claim_capacity_batch"
  | "claim_usdc";

export type FishContractAddress = {
  key: ContractAddressKey;
  label: string;
  address: string | null;
  configured: boolean;
  required: boolean;
  explorerUrl: string | null;
};

export type FishContractOnchainStatus = {
  sourceState: DataState;
  readVerified: boolean;
  error: string | null;
  chainIdVerified: boolean;
  chainIdObserved: number | null;
  decimals: {
    ocean: number | null;
    fish: number | null;
    usdc: number | null;
  };
  oceanStaking: {
    totalStakedOcean: string | null;
    totalLockedStakedOcean: string | null;
    emissionRatePerSecond: string | null;
    cooldownSeconds: number | null;
  };
  fish: {
    totalSupply: string | null;
  };
  capacityPool: {
    totalStakedFish: string | null;
    stakerCount: number | null;
    operatorFeeBps: number | null;
    totalUsdcDistributedEver: string | null;
    totalUsdcReservedForStakers: string | null;
    configuredOperatorIsOperator: boolean | null;
    currentUnstakeBatch: number | null;
    oldestUnclaimedUnstakeBatch: number | null;
    flushableAt: string | null;
  };
};

export type FishContractStatus = {
  dataState: DataState;
  lastUpdated: string;
  mode: "local_prototype" | "configured_read_only" | "testnet_actions" | "mainnet_read_only";
  chain: {
    chainId: number;
    chainName: string;
    explorerUrl: string | null;
  };
  rpc: {
    configured: boolean;
    readTimeoutMs: number;
  };
  deployment: {
    requiredConfigured: boolean;
    configuredRequiredCount: number;
    requiredCount: number;
    missingRequired: string[];
  };
  walletActionGate: {
    actionsEnabled: boolean;
    writesAllowed: boolean;
    reason: string;
  };
  settlementSubmitGate: {
    submitEnabled: boolean;
    submitAllowed: boolean;
    reason: string;
    hasOperatorPrivateKey: boolean;
    confirmations: number;
  };
  addresses: FishContractAddress[];
  onchain: FishContractOnchainStatus;
  actions: Array<{
    id: FishContractActionId;
    label: string;
    contractKey: ContractAddressKey;
    method: string;
    enabled: boolean;
  }>;
  warnings: string[];
};

type FishContractConfig = {
  chainId: number;
  chainName: string;
  explorerUrl: string | null;
  rpcUrl: string | null;
  rpcTimeoutMs: number;
  actionsEnabled: boolean;
  settlementSubmitEnabled: boolean;
  mainnetWritesAllowed: boolean;
  operatorPrivateKey: Hex | null;
  confirmations: number;
  addresses: FishContractAddress[];
};

export type CapacitySettlementSubmission = {
  submitted: boolean;
  sourceState: "live";
  chainId: number;
  operatorAddress: string;
  usdcDecimals: number;
  operatorFeeBps: number;
  grossAmountRaw: string;
  approveTxHash: string | null;
  recordPaidUsageTxHash: string;
  recordPaidUsageBlockNumber: number | null;
  confirmations: number;
};

export async function summarizeFishContracts(): Promise<FishContractStatus> {
  const config = getFishContractConfig();
  const required = config.addresses.filter((address) => address.required);
  const missingRequired = required.filter((address) => !address.configured).map((address) => address.label);
  const requiredConfigured = missingRequired.length === 0;
  const mainnet = config.chainId === BASE_CHAIN_ID;
  const writesAllowed = config.actionsEnabled && requiredConfigured && (!mainnet || config.mainnetWritesAllowed);
  const submitAllowed = config.settlementSubmitEnabled && requiredConfigured && Boolean(config.rpcUrl) && Boolean(config.operatorPrivateKey) && (!mainnet || config.mainnetWritesAllowed);
  const onchain = await readFishContractOnchainStatus(config, requiredConfigured);
  const dataState = resolveDataState({ onchainState: onchain.sourceState, requiredConfigured });
  const mode = resolveMode({ actionsEnabled: config.actionsEnabled, mainnet, requiredConfigured, writesAllowed });

  return {
    dataState,
    lastUpdated: new Date().toISOString(),
    mode,
    chain: {
      chainId: config.chainId,
      chainName: config.chainName,
      explorerUrl: config.explorerUrl
    },
    rpc: {
      configured: Boolean(config.rpcUrl),
      readTimeoutMs: config.rpcTimeoutMs
    },
    deployment: {
      requiredConfigured,
      configuredRequiredCount: required.filter((address) => address.configured).length,
      requiredCount: required.length,
      missingRequired
    },
    walletActionGate: {
      actionsEnabled: config.actionsEnabled,
      writesAllowed,
      reason: resolveWalletGateReason({ actionsEnabled: config.actionsEnabled, mainnet, requiredConfigured, writesAllowed })
    },
    settlementSubmitGate: {
      submitEnabled: config.settlementSubmitEnabled,
      submitAllowed,
      reason: resolveSettlementGateReason({
        mainnet,
        requiredConfigured,
        rpcConfigured: Boolean(config.rpcUrl),
        submitAllowed,
        submitEnabled: config.settlementSubmitEnabled,
        hasOperatorPrivateKey: Boolean(config.operatorPrivateKey)
      }),
      hasOperatorPrivateKey: Boolean(config.operatorPrivateKey),
      confirmations: config.confirmations
    },
    addresses: config.addresses,
    onchain,
    actions: [
      action("approve_ocean", "Approve OCEAN", "oceanToken", "approve(address,uint256)", writesAllowed),
      action("stake_ocean", "Stake OCEAN", "oceanStaking", "stake(address,uint256)", writesAllowed),
      action("mint_fish", "Mint FISH", "oceanStaking", "mintFish(uint256,uint256)", writesAllowed),
      action("burn_fish", "Burn FISH", "oceanStaking", "burnFish(uint256)", writesAllowed),
      action("claim_ocean_rewards", "Claim OCEAN rewards", "oceanStaking", "claim()", writesAllowed),
      action("initiate_ocean_unstake", "Start OCEAN exit", "oceanStaking", "initiateUnstake(uint256)", writesAllowed),
      action("finalize_ocean_unstake", "Finish OCEAN exit", "oceanStaking", "finalizeUnstake()", writesAllowed),
      action("approve_fish", "Approve FISH", "fishToken", "approve(address,uint256)", writesAllowed),
      action("stake_capacity", "Stake FISH capacity", "capacityPool", "stake(uint256)", writesAllowed),
      action("initiate_capacity_unstake", "Start capacity exit", "capacityPool", "initiateUnstake(uint256)", writesAllowed),
      action("flush_capacity_batch", "Start batch cooldown", "capacityPool", "flush()", writesAllowed),
      action("claim_capacity_batch", "Claim batch FISH", "capacityPool", "claimUnstakeBatch(uint32)", writesAllowed),
      action("claim_usdc", "Claim USDC", "capacityPool", "claimUsdc()", writesAllowed)
    ],
    warnings: [
      "Prototype contracts are not audited and are not ready for mainnet funds.",
      ...(requiredConfigured ? [] : [`Missing required contract config: ${missingRequired.join(", ")}`]),
      ...(config.rpcUrl ? [] : ["FISH_CONTRACT_RPC_URL is not configured, so onchain totals are not verified."]),
      ...(onchain.error ? [onchain.error] : []),
      ...(config.actionsEnabled ? [] : ["Wallet write actions are disabled until FISH_CONTRACT_ACTIONS_ENABLED=true."]),
      ...(config.settlementSubmitEnabled ? [] : ["Automatic capacity settlement submission is disabled until FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED=true."]),
      ...(config.actionsEnabled && mainnet && !config.mainnetWritesAllowed ? ["Base mainnet write actions are blocked unless FISH_CONTRACT_MAINNET_WRITES_ALLOWED=true."] : []),
      ...(config.settlementSubmitEnabled && mainnet && !config.mainnetWritesAllowed ? ["Base mainnet settlement submission is blocked unless FISH_CONTRACT_MAINNET_WRITES_ALLOWED=true."] : [])
    ]
  };
}

export async function submitCapacityPoolSettlementOnchain(grossUsdcAmount: number): Promise<CapacitySettlementSubmission> {
  const config = getFishContractConfig();
  const addresses = addressMap(config.addresses);
  const mainnet = config.chainId === BASE_CHAIN_ID;

  if (!config.settlementSubmitEnabled) throw new Error("contract_settlement_submit_disabled");
  if (mainnet && !config.mainnetWritesAllowed) throw new Error("mainnet_settlement_submit_blocked");
  if (!config.rpcUrl) throw new Error("fish_contract_rpc_url_required");
  if (!config.operatorPrivateKey) throw new Error("fish_contract_operator_private_key_required");
  if (!addresses.usdcToken || !addresses.capacityPool) throw new Error("fish_contract_settlement_addresses_required");

  const chain = createChain(config);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  await verifyClientChain(publicClient, config.chainId);
  const account = privateKeyToAccount(config.operatorPrivateKey);
  if (addresses.operator && account.address.toLowerCase() !== addresses.operator.toLowerCase()) {
    throw new Error("operator_private_key_does_not_match_configured_operator");
  }

  const capacityPoolAddress = asAddress(addresses.capacityPool);
  const usdcAddress = asAddress(addresses.usdcToken);
  const operatorIsAllowed = (await publicClient.readContract({
    address: capacityPoolAddress,
    abi: CAPACITY_POOL_ABI,
    functionName: "isOperator",
    args: [account.address]
  })) as boolean;
  if (!operatorIsAllowed) throw new Error("operator_wallet_is_not_capacity_pool_operator");

  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const usdcDecimals = Number(await publicClient.readContract({ address: usdcAddress, abi: ERC20_ABI, functionName: "decimals" }));
  const grossAmountRaw = parseUnits(decimalString(grossUsdcAmount, usdcDecimals), usdcDecimals);
  const allowance = (await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, capacityPoolAddress]
  })) as bigint;

  let approveTxHash: Hex | null = null;
  if (allowance < grossAmountRaw) {
    approveTxHash = await walletClient.writeContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [capacityPoolAddress, grossAmountRaw]
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash, confirmations: config.confirmations });
  }

  const recordPaidUsageTxHash = await walletClient.writeContract({
    address: capacityPoolAddress,
    abi: CAPACITY_POOL_ABI,
    functionName: "recordPaidUsage",
    args: [grossAmountRaw]
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: recordPaidUsageTxHash,
    confirmations: config.confirmations
  });
  const operatorFeeBps = Number(await publicClient.readContract({ address: capacityPoolAddress, abi: CAPACITY_POOL_ABI, functionName: "operatorFeeBps" }));

  return {
    submitted: true,
    sourceState: "live",
    chainId: config.chainId,
    operatorAddress: account.address,
    usdcDecimals,
    operatorFeeBps,
    grossAmountRaw: grossAmountRaw.toString(),
    approveTxHash,
    recordPaidUsageTxHash,
    recordPaidUsageBlockNumber: Number(receipt.blockNumber),
    confirmations: config.confirmations
  };
}

function getFishContractConfig(): FishContractConfig {
  const chainId = parseEnvNumber("FISH_CONTRACT_CHAIN_ID", parseEnvNumber("NEXT_PUBLIC_FISH_CONTRACT_CHAIN_ID", parseEnvNumber("FISH_USDC_CHAIN_ID", BASE_CHAIN_ID)));
  const chainName = env("FISH_CONTRACT_CHAIN_NAME") || env("NEXT_PUBLIC_FISH_CONTRACT_CHAIN_NAME") || defaultChainName(chainId);
  const explorerUrl = normalizeBaseUrl(env("FISH_CONTRACT_EXPLORER_URL") || env("NEXT_PUBLIC_FISH_CONTRACT_EXPLORER_URL") || defaultExplorerUrl(chainId));
  const rpcUrl = env("FISH_CONTRACT_RPC_URL") || env("FISH_USDC_RPC_URL") || null;
  const actionsEnabled = parseEnvBool("FISH_CONTRACT_ACTIONS_ENABLED") || parseEnvBool("NEXT_PUBLIC_FISH_CONTRACT_ACTIONS_ENABLED");
  const settlementSubmitEnabled = parseEnvBool("FISH_CONTRACT_SETTLEMENT_SUBMIT_ENABLED");
  const mainnetWritesAllowed = parseEnvBool("FISH_CONTRACT_MAINNET_WRITES_ALLOWED");
  const operatorPrivateKey = normalizePrivateKey(env("FISH_CONTRACT_OPERATOR_PRIVATE_KEY"));

  return {
    chainId,
    chainName,
    explorerUrl,
    rpcUrl,
    rpcTimeoutMs: parseEnvNumber("FISH_CONTRACT_RPC_TIMEOUT_MS", DEFAULT_RPC_TIMEOUT_MS),
    actionsEnabled,
    settlementSubmitEnabled,
    mainnetWritesAllowed,
    operatorPrivateKey,
    confirmations: parseEnvNumber("FISH_CONTRACT_SETTLEMENT_CONFIRMATIONS", DEFAULT_CONFIRMATIONS),
    addresses: [
      addressConfig("oceanToken", "OCEAN token", env("FISH_CONTRACT_OCEAN_TOKEN_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_OCEAN_TOKEN_ADDRESS"), true, explorerUrl),
      addressConfig("fishToken", "FISH token", env("FISH_CONTRACT_FISH_TOKEN_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_FISH_TOKEN_ADDRESS"), true, explorerUrl),
      addressConfig("oceanStaking", "OCEAN staking", env("FISH_CONTRACT_OCEAN_STAKING_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_OCEAN_STAKING_ADDRESS"), true, explorerUrl),
      addressConfig("capacityPool", "FISH capacity pool", env("FISH_CONTRACT_CAPACITY_POOL_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_CAPACITY_POOL_ADDRESS"), true, explorerUrl),
      addressConfig("usdcToken", "USDC token", env("FISH_CONTRACT_USDC_TOKEN_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_USDC_TOKEN_ADDRESS") || env("FISH_USDC_TOKEN_ADDRESS") || defaultUsdcAddress(chainId), true, explorerUrl),
      addressConfig("treasury", "Treasury", env("FISH_CONTRACT_TREASURY_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_TREASURY_ADDRESS"), false, explorerUrl),
      addressConfig("emissionSource", "Emission source", env("FISH_CONTRACT_EMISSION_SOURCE_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_EMISSION_SOURCE_ADDRESS"), false, explorerUrl),
      addressConfig("operator", "Capacity operator", env("FISH_CONTRACT_OPERATOR_ADDRESS") || env("NEXT_PUBLIC_FISH_CONTRACT_OPERATOR_ADDRESS"), false, explorerUrl)
    ]
  };
}

async function readFishContractOnchainStatus(config: FishContractConfig, requiredConfigured: boolean): Promise<FishContractOnchainStatus> {
  const emptyStatus = emptyOnchainStatus();
  if (!requiredConfigured) {
    return {
      ...emptyStatus,
      sourceState: "unavailable",
      error: "Required contract addresses are missing."
    };
  }
  if (!config.rpcUrl) {
    return {
      ...emptyStatus,
      sourceState: "snapshot",
      error: "FISH_CONTRACT_RPC_URL is not configured."
    };
  }

  try {
    return await withTimeout(readFishContractOnchainStatusUnsafe(config), config.rpcTimeoutMs, "fish_contract_rpc_timeout");
  } catch (err) {
    return {
      ...emptyStatus,
      sourceState: "snapshot",
      error: err instanceof Error ? err.message : "fish_contract_onchain_read_failed"
    };
  }
}

async function readFishContractOnchainStatusUnsafe(config: FishContractConfig): Promise<FishContractOnchainStatus> {
  if (!config.rpcUrl) throw new Error("fish_contract_rpc_url_required");
  const addresses = addressMap(config.addresses);
  if (!addresses.oceanToken || !addresses.fishToken || !addresses.oceanStaking || !addresses.capacityPool || !addresses.usdcToken) {
    throw new Error("fish_contract_addresses_required");
  }

  const chain = createChain(config);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const observedChainId = await verifyClientChain(publicClient, config.chainId);
  const oceanToken = asAddress(addresses.oceanToken);
  const fishToken = asAddress(addresses.fishToken);
  const usdcToken = asAddress(addresses.usdcToken);
  const oceanStaking = asAddress(addresses.oceanStaking);
  const capacityPool = asAddress(addresses.capacityPool);

  const [
    oceanDecimals,
    fishDecimals,
    usdcDecimals,
    sOceanSupply,
    totalLockedStakedOcean,
    emissionRatePerSecond,
    cooldownDuration,
    fishTotalSupply,
    totalStakedFish,
    stakerCount,
    operatorFeeBps,
    totalUsdcDistributedEver,
    totalUsdcReservedForStakers,
    currentUnstakeBatch,
    oldestUnclaimedUnstakeBatch,
    flushableAt
  ] =
    await Promise.all([
      publicClient.readContract({ address: oceanToken, abi: ERC20_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: fishToken, abi: ERC20_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: usdcToken, abi: ERC20_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: oceanStaking, abi: OCEAN_STAKING_ABI, functionName: "totalSupply" }),
      publicClient.readContract({ address: oceanStaking, abi: OCEAN_STAKING_ABI, functionName: "totalLockedStakedOcean" }),
      publicClient.readContract({ address: oceanStaking, abi: OCEAN_STAKING_ABI, functionName: "emissionRatePerSecond" }),
      publicClient.readContract({ address: oceanStaking, abi: OCEAN_STAKING_ABI, functionName: "cooldownDuration" }),
      publicClient.readContract({ address: fishToken, abi: ERC20_ABI, functionName: "totalSupply" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "totalStaked" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "stakerCount" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "operatorFeeBps" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "totalUsdcDistributedEver" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "totalUsdcReservedForStakers" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "currentUnstakeBatch" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "oldestUnclaimedUnstakeBatch" }),
      publicClient.readContract({ address: capacityPool, abi: CAPACITY_POOL_ABI, functionName: "flushableAt" })
    ]);

  const configuredOperatorIsOperator = addresses.operator
    ? ((await publicClient.readContract({
        address: capacityPool,
        abi: CAPACITY_POOL_ABI,
        functionName: "isOperator",
        args: [asAddress(addresses.operator)]
      })) as boolean)
    : null;
  const oceanDecimalsNumber = Number(oceanDecimals);
  const fishDecimalsNumber = Number(fishDecimals);
  const usdcDecimalsNumber = Number(usdcDecimals);
  const visibleSOceanSupply = visibleSOceanSupplyFromTotalSupply(sOceanSupply as bigint);

  return {
    sourceState: "live",
    readVerified: true,
    error: null,
    chainIdVerified: true,
    chainIdObserved: observedChainId,
    decimals: {
      ocean: oceanDecimalsNumber,
      fish: fishDecimalsNumber,
      usdc: usdcDecimalsNumber
    },
    oceanStaking: {
      totalStakedOcean: formatUnits(visibleSOceanSupply, oceanDecimalsNumber),
      totalLockedStakedOcean: formatUnits(totalLockedStakedOcean as bigint, oceanDecimalsNumber),
      emissionRatePerSecond: formatUnits(emissionRatePerSecond as bigint, oceanDecimalsNumber),
      cooldownSeconds: Number(cooldownDuration)
    },
    fish: {
      totalSupply: formatUnits(fishTotalSupply as bigint, fishDecimalsNumber)
    },
    capacityPool: {
      totalStakedFish: formatUnits(totalStakedFish as bigint, fishDecimalsNumber),
      stakerCount: Number(stakerCount),
      operatorFeeBps: Number(operatorFeeBps),
      totalUsdcDistributedEver: formatUnits(totalUsdcDistributedEver as bigint, usdcDecimalsNumber),
      totalUsdcReservedForStakers: formatUnits(totalUsdcReservedForStakers as bigint, usdcDecimalsNumber),
      configuredOperatorIsOperator,
      currentUnstakeBatch: Number(currentUnstakeBatch),
      oldestUnclaimedUnstakeBatch: Number(oldestUnclaimedUnstakeBatch),
      flushableAt: formatUnixTimestamp(Number(flushableAt))
    }
  };
}

function emptyOnchainStatus(): FishContractOnchainStatus {
  return {
    sourceState: "unavailable",
    readVerified: false,
    error: null,
    chainIdVerified: false,
    chainIdObserved: null,
    decimals: {
      ocean: null,
      fish: null,
      usdc: null
    },
    oceanStaking: {
      totalStakedOcean: null,
      totalLockedStakedOcean: null,
      emissionRatePerSecond: null,
      cooldownSeconds: null
    },
    fish: {
      totalSupply: null
    },
    capacityPool: {
      totalStakedFish: null,
      stakerCount: null,
      operatorFeeBps: null,
      totalUsdcDistributedEver: null,
      totalUsdcReservedForStakers: null,
      configuredOperatorIsOperator: null,
      currentUnstakeBatch: null,
      oldestUnclaimedUnstakeBatch: null,
      flushableAt: null
    }
  };
}

function createChain(config: FishContractConfig): Chain {
  const rpcUrl = config.rpcUrl ?? "http://127.0.0.1:8545";
  return {
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] }
    },
    blockExplorers: config.explorerUrl
      ? {
          default: {
            name: "Explorer",
            url: config.explorerUrl
          }
        }
      : undefined
  };
}

async function verifyClientChain(client: PublicClient, expectedChainId: number) {
  const observedChainId = await client.getChainId();
  if (observedChainId !== expectedChainId) {
    throw new Error(`RPC chain mismatch: expected ${expectedChainId}, got ${observedChainId}.`);
  }
  return observedChainId;
}

function addressConfig(key: ContractAddressKey, label: string, raw: string | undefined, required: boolean, explorerBaseUrl: string | null): FishContractAddress {
  const address = normalizeAddress(raw);
  return {
    key,
    label,
    address,
    configured: Boolean(address),
    required,
    explorerUrl: address && explorerBaseUrl ? `${explorerBaseUrl}/address/${address}` : null
  };
}

function addressMap(addresses: FishContractAddress[]) {
  return Object.fromEntries(addresses.map((entry) => [entry.key, entry.address])) as Record<ContractAddressKey, string | null>;
}

function asAddress(value: string) {
  return value as Address;
}

function action(id: FishContractActionId, label: string, contractKey: ContractAddressKey, method: string, enabled: boolean) {
  return { id, label, contractKey, method, enabled };
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseEnvNumber(name: string, fallback: number) {
  const value = Number(env(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseEnvBool(name: string) {
  const value = env(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeAddress(value: string | undefined) {
  return value && ADDRESS_PATTERN.test(value) ? value : null;
}

function normalizePrivateKey(value: string | undefined): Hex | null {
  return value && PRIVATE_KEY_PATTERN.test(value) ? (value as Hex) : null;
}

function normalizeBaseUrl(value: string | undefined) {
  return value ? value.replace(/\/+$/, "") : null;
}

function defaultChainName(chainId: number) {
  if (chainId === BASE_CHAIN_ID) return "Base";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "Base Sepolia";
  return `Chain ${chainId}`;
}

function defaultExplorerUrl(chainId: number) {
  if (chainId === BASE_CHAIN_ID) return "https://basescan.org";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "https://sepolia.basescan.org";
  return undefined;
}

function defaultUsdcAddress(chainId: number) {
  return chainId === BASE_CHAIN_ID ? BASE_USDC_ADDRESS : undefined;
}

export function visibleSOceanSupplyFromTotalSupply(sOceanSupply: bigint) {
  return subtractFloor(sOceanSupply, OCEAN_STAKING_BOOTSTRAP_SOCEAN_SUPPLY);
}

function subtractFloor(value: bigint, delta: bigint) {
  return value > delta ? value - delta : 0n;
}

function resolveDataState({ onchainState, requiredConfigured }: { onchainState: DataState; requiredConfigured: boolean }): DataState {
  if (onchainState === "live") return "live";
  if (requiredConfigured) return "snapshot";
  return "unavailable";
}

function resolveMode({ actionsEnabled, mainnet, requiredConfigured, writesAllowed }: { actionsEnabled: boolean; mainnet: boolean; requiredConfigured: boolean; writesAllowed: boolean }): FishContractStatus["mode"] {
  if (!requiredConfigured) return "local_prototype";
  if (writesAllowed && !mainnet) return "testnet_actions";
  if (mainnet) return "mainnet_read_only";
  return actionsEnabled ? "testnet_actions" : "configured_read_only";
}

function resolveWalletGateReason({ actionsEnabled, mainnet, requiredConfigured, writesAllowed }: { actionsEnabled: boolean; mainnet: boolean; requiredConfigured: boolean; writesAllowed: boolean }) {
  if (writesAllowed) return "Wallet writes are enabled for the configured chain.";
  if (!requiredConfigured) return "Required contract addresses are missing.";
  if (!actionsEnabled) return "Wallet writes are disabled by environment.";
  if (mainnet) return "Base mainnet writes are blocked by default.";
  return "Wallet writes are not enabled.";
}

function resolveSettlementGateReason({
  hasOperatorPrivateKey,
  mainnet,
  requiredConfigured,
  rpcConfigured,
  submitAllowed,
  submitEnabled
}: {
  hasOperatorPrivateKey: boolean;
  mainnet: boolean;
  requiredConfigured: boolean;
  rpcConfigured: boolean;
  submitAllowed: boolean;
  submitEnabled: boolean;
}) {
  if (submitAllowed) return "Automatic capacity settlement submission is enabled.";
  if (!requiredConfigured) return "Required contract addresses are missing.";
  if (!rpcConfigured) return "FISH_CONTRACT_RPC_URL is not configured.";
  if (!submitEnabled) return "Automatic settlement submission is disabled by environment.";
  if (!hasOperatorPrivateKey) return "FISH_CONTRACT_OPERATOR_PRIVATE_KEY is not configured.";
  if (mainnet) return "Base mainnet settlement submission is blocked by default.";
  return "Automatic settlement submission is not enabled.";
}

function decimalString(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function formatUnixTimestamp(value: number) {
  return value > 0 ? new Date(value * 1000).toISOString() : null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
