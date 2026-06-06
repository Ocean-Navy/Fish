"use client";

import { CheckCircle2, Fish, Loader2, RefreshCcw, ShipWheel, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { formatEvmAddress, parseEvmChainId } from "@/lib/evmWallet";
import { formatNumber } from "@/lib/format";

type FaucetStatus = {
  dataState: "live" | "snapshot" | "sample" | "unavailable";
  enabled: boolean;
  ready: boolean;
  reason: string;
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

type FaucetClaim = {
  claim: {
    claimId: string;
    walletPrefix: string;
    createdAt: string;
    chainId: number;
    ethTxHash: string | null;
    oceanTxHash: string | null;
    usdcTxHash: string | null;
  };
  grants: {
    ethSent: boolean;
    testOceanAmount: string;
    testUsdcAmount: string;
  };
  explorer: {
    eth: string | null;
    testOcean: string;
    testUsdc: string;
  };
};

const BASE_SEPOLIA_CHAIN_ID = 84532;

export function TestnetFaucetPanel() {
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [claim, setClaim] = useState<FaucetClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/testnet/faucet");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(readError(payload));
      }
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "faucet_status_failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }

    setIsConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const [first] = Array.isArray(accounts) ? accounts : [];
      if (typeof first !== "string") {
        throw new Error("wallet_account_missing");
      }
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
      setWalletAddress(first);
      setWalletChainId(parseEvmChainId(rawChainId));
      setNotice("Wallet connected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "wallet_connection_failed");
    } finally {
      setIsConnecting(false);
    }
  }

  async function switchToBaseSepolia() {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }

    setIsSwitching(true);
    setError(null);
    setNotice(null);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x14a34" }]
      });
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
      setWalletChainId(parseEvmChainId(rawChainId));
      setNotice("Base Sepolia selected.");
    } catch (err) {
      if (isMissingChainError(err)) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x14a34",
                chainName: "Base Sepolia",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://sepolia.base.org"],
                blockExplorerUrls: ["https://sepolia.basescan.org"]
              }
            ]
          });
          const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
          setWalletChainId(parseEvmChainId(rawChainId));
          setNotice("Base Sepolia added.");
        } catch (addError) {
          setError(addError instanceof Error ? addError.message : "wallet_chain_add_failed");
        }
      } else {
        setError(err instanceof Error ? err.message : "wallet_chain_switch_failed");
      }
    } finally {
      setIsSwitching(false);
    }
  }

  async function claimTestTokens() {
    if (!walletAddress) {
      setError("Connect a wallet first.");
      return;
    }
    if (walletChainId !== BASE_SEPOLIA_CHAIN_ID) {
      setError("Switch to Base Sepolia first.");
      return;
    }

    setIsClaiming(true);
    setError(null);
    setNotice(null);
    setClaim(null);
    try {
      const response = await fetch("/api/testnet/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(readError(payload));
      }
      setClaim(payload);
      setNotice("Test tokens sent.");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "testnet_faucet_claim_failed");
    } finally {
      setIsClaiming(false);
    }
  }

  const ready = Boolean(status?.ready);
  const connected = Boolean(walletAddress);
  const onBaseSepolia = walletChainId === BASE_SEPOLIA_CHAIN_ID;
  const canClaim = ready && connected && onBaseSepolia;
  const setupSteps = [
    { title: "Connect wallet", body: connected ? formatEvmAddress(walletAddress) : "Use any EVM wallet.", done: connected },
    { title: "Pick Base Sepolia", body: onBaseSepolia ? "Network ready." : "Fish can switch it for you.", done: onBaseSepolia },
    { title: "Claim tokens", body: ready ? "One small playground refill." : "Faucet opens when funded.", done: Boolean(claim) }
  ];

  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Testnet playground</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Try Fish without real money.</h2>
            <p className="mt-3 max-w-3xl text-base font-bold leading-7 text-fish-secondary">
              Connect a wallet, switch to Base Sepolia, and claim a small playground refill.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge label={ready ? "ready" : formatReason(status?.reason)} tone={ready ? "ready" : "muted"} />
            <button
              type="button"
              onClick={refreshStatus}
              disabled={isLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-fish-accent/35 px-4 text-xs font-black text-fish-accent transition hover:bg-fish-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {setupSteps.map((step) => (
            <StepCard key={step.title} title={step.title} body={step.body} done={step.done} />
          ))}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="rounded-3xl border border-fish-accent/20 bg-fish-navy950/45 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-fish-accent" aria-hidden="true" />
              <h3 className="text-2xl font-black text-white">Wallet</h3>
            </div>
            <div className="grid gap-3">
              <Mini label="Connected wallet" value={walletAddress ? formatEvmAddress(walletAddress) : "No wallet"} />
              <Mini label="Wallet chain" value={walletChainId ? String(walletChainId) : "Not connected"} />
              <Mini label="Cooldown" value={`${status?.limits.walletCooldownHours ?? 24}h wallet / ${status?.limits.ipCooldownHours ?? 24}h IP`} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={connectWallet}
                disabled={isConnecting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-accent/35 px-4 text-xs font-black text-fish-accent transition hover:bg-fish-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
                {connected ? "Change wallet" : "Connect"}
              </button>
              <button
                type="button"
                onClick={switchToBaseSepolia}
                disabled={!connected || isSwitching}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-gold/35 px-4 text-xs font-black text-fish-gold transition hover:bg-fish-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShipWheel className="h-4 w-4" aria-hidden="true" />}
                Base Sepolia
              </button>
              <button
                type="button"
                onClick={claimTestTokens}
                disabled={!canClaim || isClaiming}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-4 text-xs font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Fish className="h-4 w-4" aria-hidden="true" />}
                Claim
              </button>
            </div>
            {error ? (
              <div className="mt-4 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black text-fish-primary" role="alert">
                {formatReason(error)}
              </div>
            ) : null}
            {notice ? <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm font-black text-emerald-100">{notice}</div> : null}
          </div>

          <div className="rounded-3xl border border-fish-accent/20 bg-fish-navy950/45 p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShipWheel className="h-5 w-5 text-fish-accent" aria-hidden="true" />
              <h3 className="text-2xl font-black text-white">What you get</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Mini label="Gas top-up" value={`${status?.grants.ethAmount ?? "0.0005"} ETH`} />
              <Mini label="Test OCEAN" value={formatAmount(status?.grants.testOceanAmount)} />
              <Mini label="Test USDC" value={formatAmount(status?.grants.testUsdcAmount)} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Mini label="Claims left today" value={`${formatNumber(status?.usage.remainingToday ?? 0)} / ${formatNumber(status?.limits.maxDailyClaims ?? 50)}`} />
              <Mini label="Cooldown" value={`${status?.limits.walletCooldownHours ?? 24}h wallet / ${status?.limits.ipCooldownHours ?? 24}h IP`} />
              <Mini label="Resets" value={formatDateTime(status?.usage.resetAt)} />
              <Mini label="Status" value={ready ? "Ready" : formatReason(status?.reason)} />
            </div>
            {claim ? (
              <div className="mt-4 rounded-3xl border border-fish-gold/25 bg-fish-gold/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Claim sent</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <TxLink label="ETH" href={claim.explorer.eth} />
                  <TxLink label="OCEAN" href={claim.explorer.testOcean} />
                  <TxLink label="USDC" href={claim.explorer.testUsdc} />
                </div>
              </div>
            ) : null}
            <p className="mt-4 text-sm font-bold leading-6 text-fish-secondary">
              Test tokens are only for the Base Sepolia playground and have no real value.
            </p>
            <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer text-sm font-black text-fish-accent">Operator details</summary>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Mini label="Chain" value={status ? `${status.chain.chainName} (${status.chain.chainId})` : "Base Sepolia"} />
                <Mini label="Faucet ETH" value={formatAmount(status?.balances.eth)} />
                <Mini label="Faucet OCEAN" value={formatAmount(status?.balances.testOcean)} />
                <Mini label="Faucet USDC" value={formatAmount(status?.balances.testUsdc)} />
                <Mini label="Last claim" value={formatDateTime(status?.usage.latestClaimAt)} />
                <AddressMini label="Faucet wallet" value={status?.faucetAddress} />
                <AddressMini label="Test OCEAN token" value={status?.tokenAddresses.testOcean} />
                <AddressMini label="Test USDC token" value={status?.tokenAddresses.testUsdc} />
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ title, body, done }: { title: string; body: string; done: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">{title}</p>
        <CheckCircle2 className={`h-5 w-5 ${done ? "text-emerald-200" : "text-fish-secondary/50"}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-sm font-bold leading-6 text-fish-secondary">{body}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-2 break-words text-lg font-black text-white">{value}</p>
    </div>
  );
}

function AddressMini({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-2 break-all font-mono text-xs font-black text-white">{value ?? "-"}</p>
    </div>
  );
}

function TxLink({ label, href }: { label: string; href: string | null }) {
  if (!href) {
    return <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-center text-xs font-black text-fish-secondary">{label} skipped</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-full border border-fish-gold/35 px-4 py-2 text-center text-xs font-black text-fish-gold transition hover:bg-fish-gold/10">
      {label} tx
    </a>
  );
}

function Badge({ label, tone }: { label: string; tone: "ready" | "muted" }) {
  return (
    <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.08em] ${tone === "ready" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-white/15 bg-white/[0.04] text-fish-secondary"}`}>
      {label}
    </span>
  );
}

function formatAmount(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return formatNumber(Number(value));
}

function formatReason(value: string | null | undefined) {
  if (!value) {
    return "not ready";
  }
  return value.replaceAll("_", " ");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function readError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } | string }).error;
    if (typeof error === "string") {
      return error;
    }
    return error?.message ?? "request_failed";
  }
  return "request_failed";
}

function isMissingChainError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 4902);
}
