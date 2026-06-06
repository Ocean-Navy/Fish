import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, formatUnits, http, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Chain, Hex } from "viem";
import { z } from "zod";
import type { DataState } from "@/lib/types";

const ROOT = process.cwd();
const DEFAULT_FAUCET_DIR = path.join(ROOT, "data", "fish");
const DEFAULT_FAUCET_CLAIMS_PATH = path.join(DEFAULT_FAUCET_DIR, "testnet_faucet_claims.json");
const BASE_SEPOLIA_CHAIN_ID = 84532;
const DEFAULT_BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const DEFAULT_BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const ERC20_TRANSFER_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }
] as const;

const faucetClaimSchema = z.object({
  walletAddress: z.string().trim().regex(ADDRESS_PATTERN)
});

export type TestnetFaucetConfig = {
  enabled: boolean;
  chainId: number;
  chainName: string;
  explorerUrl: string;
  rpcUrl: string | null;
  faucetPrivateKey: Hex | null;
  faucetAddress: string | null;
  oceanTokenAddress: string | null;
  usdcTokenAddress: string | null;
  ethAmount: string;
  ethLowBalanceThreshold: string;
  oceanAmount: string;
  usdcAmount: string;
  cooldownHours: number;
  ipCooldownHours: number;
  maxDailyClaims: number;
  confirmations: number;
};

export type TestnetFaucetStatus = {
  dataState: DataState;
  enabled: boolean;
  ready: boolean;
  reason: string;
  claiming: {
    available: boolean;
    state: "ready" | "closed" | "setup";
    message: string;
    action: string;
  };
  chain: {
    chainId: number;
    chainName: string;
    explorerUrl: string;
  };
  faucetAddress: string | null;
  tokenAddresses: {
    testOcean: string | null;
    testUsdc: string | null;
  };
  grants: {
    ethAmount: string;
    ethLowBalanceThreshold: string;
    testOceanAmount: string;
    testUsdcAmount: string;
  };
  limits: {
    walletCooldownHours: number;
    ipCooldownHours: number;
    maxDailyClaims: number;
  };
  usage: {
    claimsToday: number;
    remainingToday: number;
    resetAt: string;
    latestClaimAt: string | null;
  };
  balances: {
    eth: string | null;
    testOcean: string | null;
    testUsdc: string | null;
  };
  warnings: string[];
};

export type TestnetFaucetClaim = {
  claimId: string;
  walletHash: string;
  walletPrefix: string;
  ipHash: string;
  status: "succeeded" | "failed";
  createdAt: string;
  chainId: number;
  ethTxHash: string | null;
  oceanTxHash: string | null;
  usdcTxHash: string | null;
  failureReason: string | null;
};

type FaucetLedger = {
  claims: TestnetFaucetClaim[];
};

type TestnetFaucetOptions = {
  claimsPath?: string;
  now?: Date;
};

export function parseTestnetFaucetClaim(body: unknown) {
  return faucetClaimSchema.safeParse(body);
}

export async function summarizeTestnetFaucet(options: TestnetFaucetOptions = {}): Promise<TestnetFaucetStatus> {
  const config = getTestnetFaucetConfig();
  const now = options.now ?? new Date();
  const readiness = getFaucetReadiness(config);
  const balances = readiness.ready ? await readFaucetBalances(config) : { eth: null, testOcean: null, testUsdc: null };
  const warnings = [
    "Testnet tokens have no real value.",
    "The faucet is only for Base Sepolia playground testing.",
    "Mainnet contract writes stay blocked by the normal contract gates."
  ];
  let ledger: FaucetLedger = { claims: [] };
  try {
    ledger = await readFaucetLedger(options.claimsPath);
  } catch {
    warnings.push("Faucet claim counters are temporarily unavailable.");
  }
  const usage = summarizeFaucetUsage(ledger, config, now);

  return {
    dataState: readiness.ready ? "live" : config.enabled ? "snapshot" : "unavailable",
    enabled: config.enabled,
    ready: readiness.ready,
    reason: readiness.reason,
    claiming: publicClaimingState(readiness, config),
    chain: {
      chainId: config.chainId,
      chainName: config.chainName,
      explorerUrl: config.explorerUrl
    },
    faucetAddress: config.faucetAddress,
    tokenAddresses: {
      testOcean: config.oceanTokenAddress,
      testUsdc: config.usdcTokenAddress
    },
    grants: {
      ethAmount: config.ethAmount,
      ethLowBalanceThreshold: config.ethLowBalanceThreshold,
      testOceanAmount: config.oceanAmount,
      testUsdcAmount: config.usdcAmount
    },
    limits: {
      walletCooldownHours: config.cooldownHours,
      ipCooldownHours: config.ipCooldownHours,
      maxDailyClaims: config.maxDailyClaims
    },
    usage,
    balances,
    warnings
  };
}

export async function claimTestnetFaucet(walletAddress: string, ipAddress: string, options: TestnetFaucetOptions = {}) {
  const config = getTestnetFaucetConfig();
  const now = options.now ?? new Date();
  const readiness = getFaucetReadiness(config);
  const normalizedWallet = normalizeAddress(walletAddress);
  const ipHash = hashValue(cleanIp(ipAddress));

  if (!normalizedWallet) {
    return { ok: false as const, status: 400, error: "invalid_wallet_address" };
  }
  if (!readiness.ready) {
    return { ok: false as const, status: 503, error: readiness.reason };
  }

  const ledger = await readFaucetLedger(options.claimsPath);
  const rateLimit = checkFaucetRateLimit(ledger, {
    config,
    ipHash,
    now,
    walletHash: hashValue(normalizedWallet)
  });
  if (!rateLimit.ok) {
    return rateLimit;
  }

  try {
    const result = await submitFaucetTransfers(config, normalizedWallet);
    const claim: TestnetFaucetClaim = {
      claimId: `faucet_${now.getTime()}_${hashValue(`${normalizedWallet}:${now.toISOString()}`).slice(0, 12)}`,
      walletHash: hashValue(normalizedWallet),
      walletPrefix: `${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`,
      ipHash,
      status: "succeeded",
      createdAt: now.toISOString(),
      chainId: config.chainId,
      ethTxHash: result.ethTxHash,
      oceanTxHash: result.oceanTxHash,
      usdcTxHash: result.usdcTxHash,
      failureReason: null
    };
    ledger.claims.push(claim);
    await writeFaucetLedger(ledger, options.claimsPath);

    return {
      ok: true as const,
      claim,
      grants: {
        ethSent: result.ethSent,
        testOceanAmount: config.oceanAmount,
        testUsdcAmount: config.usdcAmount
      },
      explorer: {
        eth: result.ethTxHash ? `${config.explorerUrl}/tx/${result.ethTxHash}` : null,
        testOcean: `${config.explorerUrl}/tx/${result.oceanTxHash}`,
        testUsdc: `${config.explorerUrl}/tx/${result.usdcTxHash}`
      }
    };
  } catch (error) {
    const claim: TestnetFaucetClaim = {
      claimId: `faucet_${now.getTime()}_${hashValue(`${normalizedWallet}:failed:${now.toISOString()}`).slice(0, 12)}`,
      walletHash: hashValue(normalizedWallet),
      walletPrefix: `${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}`,
      ipHash,
      status: "failed",
      createdAt: now.toISOString(),
      chainId: config.chainId,
      ethTxHash: null,
      oceanTxHash: null,
      usdcTxHash: null,
      failureReason: error instanceof Error ? error.message : "testnet_faucet_claim_failed"
    };
    ledger.claims.push(claim);
    await writeFaucetLedger(ledger, options.claimsPath);
    return {
      ok: false as const,
      status: 502,
      error: claim.failureReason
    };
  }
}

function publicClaimingState(readiness: { ready: boolean; reason: string }, config: TestnetFaucetConfig): TestnetFaucetStatus["claiming"] {
  if (readiness.ready) {
    return {
      available: true,
      state: "ready",
      message: "Playground refills are open.",
      action: "Connect a wallet, switch to Base Sepolia, and claim a small refill."
    };
  }

  if (!config.enabled || readiness.reason === "testnet_faucet_disabled") {
    return {
      available: false,
      state: "closed",
      message: "Playground refills are closed right now.",
      action: "You can still connect a wallet and explore the testnet pages."
    };
  }

  return {
    available: false,
    state: "setup",
    message: "Playground refills are being prepared.",
    action: "The faucet needs funding or operator setup before claims open."
  };
}

export function getTestnetFaucetConfig(): TestnetFaucetConfig {
  const faucetPrivateKey = normalizePrivateKey(env("FISH_TESTNET_FAUCET_PRIVATE_KEY"));
  const faucetAddress = faucetPrivateKey ? privateKeyToAccount(faucetPrivateKey).address : null;
  const chainId = parsePositiveInteger(env("FISH_TESTNET_FAUCET_CHAIN_ID") || env("FISH_CONTRACT_CHAIN_ID"), BASE_SEPOLIA_CHAIN_ID);

  return {
    enabled: parseBoolean(env("FISH_TESTNET_FAUCET_ENABLED"), false),
    chainId,
    chainName: env("FISH_TESTNET_FAUCET_CHAIN_NAME") || defaultChainName(chainId),
    explorerUrl: normalizeBaseUrl(env("FISH_TESTNET_FAUCET_EXPLORER_URL")) || defaultExplorerUrl(chainId),
    rpcUrl: env("FISH_TESTNET_FAUCET_RPC_URL") || env("FISH_CONTRACT_RPC_URL") || env("FISH_USDC_RPC_URL") || DEFAULT_BASE_SEPOLIA_RPC,
    faucetPrivateKey,
    faucetAddress,
    oceanTokenAddress: normalizeAddress(env("FISH_TESTNET_FAUCET_OCEAN_TOKEN_ADDRESS") || env("FISH_CONTRACT_OCEAN_TOKEN_ADDRESS")),
    usdcTokenAddress: normalizeAddress(env("FISH_TESTNET_FAUCET_USDC_TOKEN_ADDRESS") || env("FISH_CONTRACT_USDC_TOKEN_ADDRESS") || env("FISH_USDC_TOKEN_ADDRESS")),
    ethAmount: env("FISH_TESTNET_FAUCET_ETH_AMOUNT") || "0.0005",
    ethLowBalanceThreshold: env("FISH_TESTNET_FAUCET_ETH_LOW_BALANCE_THRESHOLD") || "0.0002",
    oceanAmount: env("FISH_TESTNET_FAUCET_OCEAN_AMOUNT") || "1000",
    usdcAmount: env("FISH_TESTNET_FAUCET_USDC_AMOUNT") || "25",
    cooldownHours: parsePositiveInteger(env("FISH_TESTNET_FAUCET_WALLET_COOLDOWN_HOURS"), 24),
    ipCooldownHours: parsePositiveInteger(env("FISH_TESTNET_FAUCET_IP_COOLDOWN_HOURS"), 24),
    maxDailyClaims: parsePositiveInteger(env("FISH_TESTNET_FAUCET_MAX_DAILY_CLAIMS"), 50),
    confirmations: parsePositiveInteger(env("FISH_TESTNET_FAUCET_CONFIRMATIONS"), 1)
  };
}

function getFaucetReadiness(config: TestnetFaucetConfig) {
  if (!config.enabled) return { ready: false, reason: "testnet_faucet_disabled" };
  if (config.chainId !== BASE_SEPOLIA_CHAIN_ID) return { ready: false, reason: "testnet_faucet_base_sepolia_required" };
  if (!config.rpcUrl) return { ready: false, reason: "testnet_faucet_rpc_required" };
  if (!config.faucetPrivateKey || !config.faucetAddress) return { ready: false, reason: "testnet_faucet_private_key_required" };
  if (!config.oceanTokenAddress) return { ready: false, reason: "testnet_faucet_ocean_token_required" };
  if (!config.usdcTokenAddress) return { ready: false, reason: "testnet_faucet_usdc_token_required" };
  return { ready: true, reason: "ready" };
}

function checkFaucetRateLimit(
  ledger: FaucetLedger,
  input: {
    config: TestnetFaucetConfig;
    ipHash: string;
    now: Date;
    walletHash: string;
  }
) {
  const successfulClaims = ledger.claims.filter((claim) => claim.status === "succeeded");
  const dayStart = startOfUtcDay(input.now);
  const dailyClaims = successfulClaims.filter((claim) => Date.parse(claim.createdAt) >= dayStart.getTime()).length;
  if (dailyClaims >= input.config.maxDailyClaims) {
    return { ok: false as const, status: 429, error: "testnet_faucet_daily_cap_reached", resetAt: new Date(dayStart.getTime() + 24 * 60 * 60_000).toISOString() };
  }

  const walletClaim = latestClaim(successfulClaims.filter((claim) => claim.walletHash === input.walletHash));
  const walletResetAt = cooldownResetAt(walletClaim?.createdAt, input.config.cooldownHours);
  if (walletResetAt && walletResetAt.getTime() > input.now.getTime()) {
    return { ok: false as const, status: 429, error: "testnet_faucet_wallet_cooldown", resetAt: walletResetAt.toISOString() };
  }

  const ipClaim = latestClaim(successfulClaims.filter((claim) => claim.ipHash === input.ipHash));
  const ipResetAt = cooldownResetAt(ipClaim?.createdAt, input.config.ipCooldownHours);
  if (ipResetAt && ipResetAt.getTime() > input.now.getTime()) {
    return { ok: false as const, status: 429, error: "testnet_faucet_ip_cooldown", resetAt: ipResetAt.toISOString() };
  }

  return { ok: true as const };
}

function summarizeFaucetUsage(ledger: FaucetLedger, config: TestnetFaucetConfig, now: Date) {
  const successfulClaims = ledger.claims.filter((claim) => claim.status === "succeeded");
  const dayStart = startOfUtcDay(now);
  const resetAt = new Date(dayStart.getTime() + 24 * 60 * 60_000).toISOString();
  const claimsToday = successfulClaims.filter((claim) => Date.parse(claim.createdAt) >= dayStart.getTime()).length;
  const latestClaimAt = latestClaim(successfulClaims)?.createdAt ?? null;
  return {
    claimsToday,
    remainingToday: Math.max(0, config.maxDailyClaims - claimsToday),
    resetAt,
    latestClaimAt
  };
}

async function submitFaucetTransfers(config: TestnetFaucetConfig, walletAddress: string) {
  if (!config.rpcUrl || !config.faucetPrivateKey || !config.oceanTokenAddress || !config.usdcTokenAddress) {
    throw new Error("testnet_faucet_not_ready");
  }

  const chain = createBaseSepoliaChain(config);
  const account = privateKeyToAccount(config.faucetPrivateKey);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const observedChainId = await publicClient.getChainId();
  if (observedChainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(`testnet_faucet_rpc_chain_mismatch_${observedChainId}`);
  }

  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const recipient = walletAddress as Address;
  const ethThreshold = parseEther(config.ethLowBalanceThreshold);
  const ethGrant = parseEther(config.ethAmount);
  const recipientEthBalance = await publicClient.getBalance({ address: recipient });
  const faucetEthBalance = await publicClient.getBalance({ address: account.address });
  let ethTxHash: Hex | null = null;
  let ethSent = false;
  if (recipientEthBalance < ethThreshold) {
    if (faucetEthBalance < ethGrant) throw new Error("testnet_faucet_eth_balance_low");
    ethTxHash = await walletClient.sendTransaction({ to: recipient, value: ethGrant });
    await publicClient.waitForTransactionReceipt({ hash: ethTxHash, confirmations: config.confirmations });
    ethSent = true;
  }

  const oceanAddress = config.oceanTokenAddress as Address;
  const usdcAddress = config.usdcTokenAddress as Address;
  const [oceanDecimals, usdcDecimals] = await Promise.all([
    publicClient.readContract({ address: oceanAddress, abi: ERC20_TRANSFER_ABI, functionName: "decimals" }),
    publicClient.readContract({ address: usdcAddress, abi: ERC20_TRANSFER_ABI, functionName: "decimals" })
  ]);
  const oceanAmount = parseUnits(config.oceanAmount, Number(oceanDecimals));
  const usdcAmount = parseUnits(config.usdcAmount, Number(usdcDecimals));
  const [faucetOceanBalance, faucetUsdcBalance] = await Promise.all([
    publicClient.readContract({ address: oceanAddress, abi: ERC20_TRANSFER_ABI, functionName: "balanceOf", args: [account.address] }),
    publicClient.readContract({ address: usdcAddress, abi: ERC20_TRANSFER_ABI, functionName: "balanceOf", args: [account.address] })
  ]);
  if ((faucetOceanBalance as bigint) < oceanAmount) throw new Error("testnet_faucet_ocean_balance_low");
  if ((faucetUsdcBalance as bigint) < usdcAmount) throw new Error("testnet_faucet_usdc_balance_low");

  const oceanTxHash = await walletClient.writeContract({
    address: oceanAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipient, oceanAmount]
  });
  await publicClient.waitForTransactionReceipt({ hash: oceanTxHash, confirmations: config.confirmations });

  const usdcTxHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipient, usdcAmount]
  });
  await publicClient.waitForTransactionReceipt({ hash: usdcTxHash, confirmations: config.confirmations });

  return {
    ethSent,
    ethTxHash,
    oceanTxHash,
    usdcTxHash
  };
}

async function readFaucetBalances(config: TestnetFaucetConfig) {
  if (!config.rpcUrl || !config.faucetAddress || !config.oceanTokenAddress || !config.usdcTokenAddress) {
    return { eth: null, testOcean: null, testUsdc: null };
  }

  try {
    const chain = createBaseSepoliaChain(config);
    const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
    const faucetAddress = config.faucetAddress as Address;
    const oceanAddress = config.oceanTokenAddress as Address;
    const usdcAddress = config.usdcTokenAddress as Address;
    const [ethBalance, oceanDecimals, usdcDecimals, oceanBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address: faucetAddress }),
      publicClient.readContract({ address: oceanAddress, abi: ERC20_TRANSFER_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: usdcAddress, abi: ERC20_TRANSFER_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: oceanAddress, abi: ERC20_TRANSFER_ABI, functionName: "balanceOf", args: [faucetAddress] }),
      publicClient.readContract({ address: usdcAddress, abi: ERC20_TRANSFER_ABI, functionName: "balanceOf", args: [faucetAddress] })
    ]);
    return {
      eth: formatUnits(ethBalance, 18),
      testOcean: formatUnits(oceanBalance as bigint, Number(oceanDecimals)),
      testUsdc: formatUnits(usdcBalance as bigint, Number(usdcDecimals))
    };
  } catch {
    return { eth: null, testOcean: null, testUsdc: null };
  }
}

async function readFaucetLedger(claimsPath = DEFAULT_FAUCET_CLAIMS_PATH): Promise<FaucetLedger> {
  try {
    const raw = await readFile(claimsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.claims)) {
      return parsed as FaucetLedger;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { claims: [] };
}

async function writeFaucetLedger(ledger: FaucetLedger, claimsPath = DEFAULT_FAUCET_CLAIMS_PATH) {
  await mkdir(path.dirname(claimsPath), { recursive: true });
  await writeFile(claimsPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function createBaseSepoliaChain(config: TestnetFaucetConfig): Chain {
  const rpcUrl = config.rpcUrl ?? DEFAULT_BASE_SEPOLIA_RPC;
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
    blockExplorers: {
      default: {
        name: "BaseScan",
        url: config.explorerUrl
      }
    }
  };
}

function latestClaim(claims: TestnetFaucetClaim[]) {
  return claims.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
}

function startOfUtcDay(value: Date) {
  const dayStart = new Date(value);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
}

function cooldownResetAt(createdAt: string | undefined, hours: number) {
  if (!createdAt) {
    return null;
  }
  return new Date(Date.parse(createdAt) + hours * 60 * 60_000);
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanIp(value: string) {
  return value.split(",")[0]?.trim() || "unknown";
}

function normalizeAddress(value: string | undefined) {
  return value && ADDRESS_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizePrivateKey(value: string | undefined): Hex | null {
  return value && PRIVATE_KEY_PATTERN.test(value) ? (value as Hex) : null;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  const clean = value?.trim().toLowerCase();
  if (!clean) {
    return fallback;
  }
  return clean === "1" || clean === "true" || clean === "yes" || clean === "on";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined) {
  return value ? value.replace(/\/+$/, "") : null;
}

function defaultChainName(chainId: number) {
  return chainId === BASE_SEPOLIA_CHAIN_ID ? "Base Sepolia" : `Chain ${chainId}`;
}

function defaultExplorerUrl(chainId: number) {
  return chainId === BASE_SEPOLIA_CHAIN_ID ? DEFAULT_BASE_SEPOLIA_EXPLORER : DEFAULT_BASE_SEPOLIA_EXPLORER;
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}
