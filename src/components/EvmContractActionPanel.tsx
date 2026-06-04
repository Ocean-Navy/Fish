"use client";

import { ExternalLink, Loader2, Send, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { encodeFunctionData, parseUnits } from "viem";
import type { Address } from "viem";
import type { FishContractActionId, FishContractStatus } from "@/lib/fishContracts";
import { formatEvmAddress, parseEvmChainId } from "@/lib/evmWallet";

const ERC20_WRITES_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }
] as const;

const OCEAN_STAKING_WRITES_ABI = [
  { type: "function", name: "burnFish", stateMutability: "nonpayable", inputs: [{ name: "fishAmountToBurn", type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "finalizeUnstake", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "initiateUnstake", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "mintFish", stateMutability: "nonpayable", inputs: [{ name: "sOceanAmountToLock", type: "uint256" }, { name: "minFishAmountOut", type: "uint256" }], outputs: [] },
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ name: "recipient", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }
] as const;

const CAPACITY_POOL_WRITES_ABI = [
  { type: "function", name: "claimUnstakeBatch", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint32" }], outputs: [] },
  { type: "function", name: "claimUsdc", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "flush", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "initiateUnstake", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] }
] as const;

type ActionGroup = {
  title: string;
  note: string;
  actions: Array<{
    id: FishContractActionId;
    label: string;
  }>;
};

export function EvmContractActionPanel({ status }: { status: FishContractStatus }) {
  const addresses = useMemo(() => Object.fromEntries(status.addresses.map((entry) => [entry.key, entry.address])) as Record<string, string | null>, [status.addresses]);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [oceanAmount, setOceanAmount] = useState("100");
  const [fishAmount, setFishAmount] = useState("100");
  const [batchId, setBatchId] = useState(() => String(status.onchain.capacityPool.oldestUnclaimedUnstakeBatch ?? 1));
  const [busyAction, setBusyAction] = useState<FishContractActionId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chainMatches = chainId === null || chainId === status.chain.chainId;
  const canWrite = status.walletActionGate.writesAllowed && Boolean(addresses.oceanToken && addresses.fishToken && addresses.oceanStaking && addresses.capacityPool);
  const disabledReason = canWrite ? null : status.walletActionGate.reason;

  async function connectWallet() {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const [first] = Array.isArray(accounts) ? accounts : [];
      if (typeof first !== "string") throw new Error("wallet_account_missing");
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
      setAddress(first);
      setChainId(parseEvmChainId(rawChainId));
      setNotice("Wallet connected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "wallet_connection_failed");
    }
  }

  async function switchChain() {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${status.chain.chainId.toString(16)}` }]
      });
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(parseEvmChainId(rawChainId));
      setNotice(`Switched to ${status.chain.chainName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "chain_switch_failed");
    }
  }

  async function sendAction(actionId: FishContractActionId) {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (!canWrite) {
      setError(disabledReason ?? "Contract writes are disabled.");
      return;
    }
    if (!chainMatches) {
      setError(`Switch to ${status.chain.chainName} first.`);
      return;
    }

    setBusyAction(actionId);
    setError(null);
    setNotice(null);
    try {
      const tx = buildTransaction(actionId, {
        userAddress: address,
        oceanAmount,
        fishAmount,
        batchId,
        oceanToken: requireAddress(addresses.oceanToken, "OCEAN token"),
        fishToken: requireAddress(addresses.fishToken, "FISH token"),
        oceanStaking: requireAddress(addresses.oceanStaking, "OCEAN staking"),
        capacityPool: requireAddress(addresses.capacityPool, "capacity pool")
      });
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx]
      });
      setNotice(typeof txHash === "string" ? `Transaction sent: ${txHash}` : "Transaction sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "contract_action_failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-3xl border border-fish-accent/20 bg-fish-navy950/55 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">Wallet actions</p>
          <h3 className="mt-2 text-2xl font-black text-white">Testnet controls.</h3>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-fish-secondary">
            These buttons only send transactions when the contract addresses and write gate are enabled. Mainnet writes stay blocked by default.
          </p>
        </div>
        <button
          type="button"
          onClick={connectWallet}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-accent/35 px-4 text-sm font-black text-fish-accent transition hover:bg-fish-accent/10"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          {address ? formatEvmAddress(address) : "Connect"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="OCEAN / sOCEAN amount" value={oceanAmount} onChange={setOceanAmount} />
        <Field label="FISH amount" value={fishAmount} onChange={setFishAmount} />
        <Field label="Batch ID" value={batchId} onChange={setBatchId} inputMode="numeric" />
      </div>

      <div className="mt-4 space-y-4">
        {actionGroups.map((group) => (
          <div key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-3">
              <p className="text-sm font-black text-white">{group.title}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-fish-secondary">{group.note}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.actions.map((action) => (
                <ActionButton key={action.id} label={action.label} actionId={action.id} busyAction={busyAction} disabled={!canWrite || !address || !chainMatches} onClick={sendAction} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Mini label="Connected chain" value={chainId ? String(chainId) : "Not connected"} />
        <Mini label="Target chain" value={`${status.chain.chainName} (${status.chain.chainId})`} />
        <Mini label="Current batch" value={status.onchain.capacityPool.currentUnstakeBatch === null ? "-" : String(status.onchain.capacityPool.currentUnstakeBatch)} />
        <Mini label="Oldest claim batch" value={status.onchain.capacityPool.oldestUnclaimedUnstakeBatch === null ? "-" : String(status.onchain.capacityPool.oldestUnclaimedUnstakeBatch)} />
        <Mini label="Batch can flush" value={status.onchain.capacityPool.flushableAt ? formatShortDate(status.onchain.capacityPool.flushableAt) : "-"} />
      </div>

      {!chainMatches && address ? (
        <button type="button" onClick={switchChain} className="mt-4 inline-flex h-11 items-center rounded-full bg-fish-accent px-5 text-sm font-black text-fish-navy950">
          Switch chain
        </button>
      ) : null}

      {disabledReason ? <p className="mt-4 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-black leading-6 text-fish-primary">{disabledReason}</p> : null}
      {error ? <p className="mt-4 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black leading-6 text-fish-primary">{error}</p> : null}
      {notice ? <p className="mt-4 break-all rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm font-black leading-6 text-emerald-100">{notice}</p> : null}
    </div>
  );
}

export function ContractAddressList({ status }: { status: FishContractStatus }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {status.addresses.map((entry) => (
        <div key={entry.key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{entry.label}</p>
          <p className="mt-2 break-all text-sm font-black text-white">{entry.address ?? "Not configured"}</p>
          {entry.explorerUrl ? (
            <a className="mt-3 inline-flex items-center gap-1 text-xs font-black text-fish-accent hover:text-white" href={entry.explorerUrl} target="_blank" rel="noreferrer">
              Explorer <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const actionGroups: ActionGroup[] = [
  {
    title: "Catch FISH",
    note: "Approve OCEAN, stake it, then lock sOCEAN to mint FISH.",
    actions: [
      { id: "approve_ocean", label: "Approve OCEAN" },
      { id: "stake_ocean", label: "Stake OCEAN" },
      { id: "mint_fish", label: "Mint FISH" }
    ]
  },
  {
    title: "Serve capacity",
    note: "Put FISH into the pool and claim USDC when paid demand is settled.",
    actions: [
      { id: "approve_fish", label: "Approve FISH" },
      { id: "stake_capacity", label: "Stake capacity" },
      { id: "claim_usdc", label: "Claim USDC" }
    ]
  },
  {
    title: "Leave the pool",
    note: "Queue FISH, flush the batch, then claim the batch after cooldown.",
    actions: [
      { id: "initiate_capacity_unstake", label: "Queue FISH exit" },
      { id: "flush_capacity_batch", label: "Flush batch" },
      { id: "claim_capacity_batch", label: "Claim FISH batch" }
    ]
  },
  {
    title: "Unlock OCEAN",
    note: "Burn FISH to unlock sOCEAN, then start and finish the OCEAN cooldown.",
    actions: [
      { id: "burn_fish", label: "Burn FISH" },
      { id: "claim_ocean_rewards", label: "Claim rewards" },
      { id: "initiate_ocean_unstake", label: "Start OCEAN exit" },
      { id: "finalize_ocean_unstake", label: "Finish OCEAN exit" }
    ]
  }
];

function ActionButton({ actionId, busyAction, disabled, label, onClick }: { actionId: FishContractActionId; busyAction: FishContractActionId | null; disabled: boolean; label: string; onClick: (actionId: FishContractActionId) => void }) {
  const busy = busyAction === actionId;
  return (
    <button
      type="button"
      disabled={disabled || busyAction !== null}
      onClick={() => onClick(actionId)}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-accent/30 px-4 text-sm font-black text-fish-accent transition hover:bg-fish-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
      {label}
    </button>
  );
}

function Field({ inputMode = "decimal", label, onChange, value }: { inputMode?: "decimal" | "numeric"; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        className="mt-2 h-11 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition focus:border-fish-accent"
      />
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  );
}

function buildTransaction(
  actionId: FishContractActionId,
  params: {
    userAddress: string;
    oceanAmount: string;
    fishAmount: string;
    batchId: string;
    oceanToken: string;
    fishToken: string;
    oceanStaking: string;
    capacityPool: string;
  }
) {
  const userAddress = asAddress(params.userAddress);
  const oceanAmount = parseTokenAmount(params.oceanAmount);
  const fishAmount = parseTokenAmount(params.fishAmount);
  const batchId = parseBatchId(params.batchId);
  const oceanStaking = asAddress(params.oceanStaking);
  const capacityPool = asAddress(params.capacityPool);

  if (actionId === "approve_ocean") {
    return {
      from: params.userAddress,
      to: params.oceanToken,
      data: encodeFunctionData({ abi: ERC20_WRITES_ABI, functionName: "approve", args: [oceanStaking, oceanAmount] })
    };
  }
  if (actionId === "stake_ocean") {
    return {
      from: params.userAddress,
      to: params.oceanStaking,
      data: encodeFunctionData({ abi: OCEAN_STAKING_WRITES_ABI, functionName: "stake", args: [userAddress, oceanAmount] })
    };
  }
  if (actionId === "mint_fish") {
    return {
      from: params.userAddress,
      to: params.oceanStaking,
      data: encodeFunctionData({ abi: OCEAN_STAKING_WRITES_ABI, functionName: "mintFish", args: [oceanAmount, 0n] })
    };
  }
  if (actionId === "burn_fish") {
    return {
      from: params.userAddress,
      to: params.oceanStaking,
      data: encodeFunctionData({ abi: OCEAN_STAKING_WRITES_ABI, functionName: "burnFish", args: [fishAmount] })
    };
  }
  if (actionId === "claim_ocean_rewards") {
    return {
      from: params.userAddress,
      to: params.oceanStaking,
      data: encodeFunctionData({ abi: OCEAN_STAKING_WRITES_ABI, functionName: "claim" })
    };
  }
  if (actionId === "initiate_ocean_unstake") {
    return {
      from: params.userAddress,
      to: params.oceanStaking,
      data: encodeFunctionData({ abi: OCEAN_STAKING_WRITES_ABI, functionName: "initiateUnstake", args: [oceanAmount] })
    };
  }
  if (actionId === "finalize_ocean_unstake") {
    return {
      from: params.userAddress,
      to: params.oceanStaking,
      data: encodeFunctionData({ abi: OCEAN_STAKING_WRITES_ABI, functionName: "finalizeUnstake" })
    };
  }
  if (actionId === "approve_fish") {
    return {
      from: params.userAddress,
      to: params.fishToken,
      data: encodeFunctionData({ abi: ERC20_WRITES_ABI, functionName: "approve", args: [capacityPool, fishAmount] })
    };
  }
  if (actionId === "stake_capacity") {
    return {
      from: params.userAddress,
      to: params.capacityPool,
      data: encodeFunctionData({ abi: CAPACITY_POOL_WRITES_ABI, functionName: "stake", args: [fishAmount] })
    };
  }
  if (actionId === "initiate_capacity_unstake") {
    return {
      from: params.userAddress,
      to: params.capacityPool,
      data: encodeFunctionData({ abi: CAPACITY_POOL_WRITES_ABI, functionName: "initiateUnstake", args: [fishAmount] })
    };
  }
  if (actionId === "flush_capacity_batch") {
    return {
      from: params.userAddress,
      to: params.capacityPool,
      data: encodeFunctionData({ abi: CAPACITY_POOL_WRITES_ABI, functionName: "flush" })
    };
  }
  if (actionId === "claim_capacity_batch") {
    return {
      from: params.userAddress,
      to: params.capacityPool,
      data: encodeFunctionData({ abi: CAPACITY_POOL_WRITES_ABI, functionName: "claimUnstakeBatch", args: [batchId] })
    };
  }
  return {
    from: params.userAddress,
    to: params.capacityPool,
    data: encodeFunctionData({ abi: CAPACITY_POOL_WRITES_ABI, functionName: "claimUsdc" })
  };
}

function requireAddress(value: string | null | undefined, label: string) {
  if (!value) throw new Error(`${label} is not configured.`);
  return value;
}

function asAddress(value: string) {
  return value as Address;
}

function parseTokenAmount(input: string) {
  const normalized = input.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Enter a positive token amount.");
  return parseUnits(normalized, 18);
}

function parseBatchId(input: string) {
  const normalized = input.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("Enter a batch ID.");
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 1 || value > 4294967295) throw new Error("Enter a valid batch ID.");
  return value;
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}
