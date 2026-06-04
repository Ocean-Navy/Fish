"use client";

import { Loader2, PenLine, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { formatEvmAddress, parseEvmChainId } from "@/lib/evmWallet";
import { formatDateTime, formatNumber } from "@/lib/format";

type WalletIntent = {
  intentId: string;
  addressPrefix: string;
  chainId: number;
  oceanAmount: number;
  lockDays: number;
  estimatedCredits: number;
  signatureState: "submitted_unverified";
  createdAt: string;
};

export function EvmStakeIntentPanel() {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [holderLabel, setHolderLabel] = useState("Ocean holder");
  const [oceanAmount, setOceanAmount] = useState("1000");
  const [lockDays, setLockDays] = useState("30");
  const [intent, setIntent] = useState<WalletIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const estimatedCredits = useMemo(() => {
    const ocean = Number(oceanAmount);
    const days = Number(lockDays);
    if (!Number.isFinite(ocean) || !Number.isFinite(days)) {
      return 0;
    }
    return Math.max(1, Math.floor(ocean * (days / 30) * 0.1));
  }, [lockDays, oceanAmount]);

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
      setAddress(first);
      setChainId(parseEvmChainId(rawChainId));
      setNotice("Wallet connected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "wallet_connection_failed");
    } finally {
      setIsConnecting(false);
    }
  }

  async function signIntent() {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }
    if (!address || !chainId) {
      setError("Connect a wallet first.");
      return;
    }
    const parsedOcean = Number(oceanAmount);
    const parsedLockDays = Number(lockDays);
    if (!Number.isFinite(parsedOcean) || parsedOcean < 1 || !Number.isFinite(parsedLockDays) || parsedLockDays < 7) {
      setError("Choose a valid OCEAN amount and lock time.");
      return;
    }

    setIsSigning(true);
    setError(null);
    setNotice(null);
    try {
      const message = [
        "Fish OCEAN credit intent",
        `Address: ${address}`,
        `Chain ID: ${chainId}`,
        `OCEAN amount: ${parsedOcean}`,
        `Lock days: ${parsedLockDays}`,
        `Estimated Fish Credits: ${estimatedCredits}`,
        "Purpose: request Fish Credits after OCEAN lock verification.",
        `Created at: ${new Date().toISOString()}`
      ].join("\n");
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address]
      });
      if (typeof signature !== "string") {
        throw new Error("wallet_signature_missing");
      }
      const response = await fetch("/api/staking/wallet-intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          holderLabel,
          address,
          chainId,
          oceanAmount: parsedOcean,
          lockDays: parsedLockDays,
          message,
          signature
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "wallet_intent_failed");
      }
      setIntent(payload.intent);
      setNotice("Intent recorded. This does not issue credits yet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "wallet_intent_failed");
    } finally {
      setIsSigning(false);
    }
  }

  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Wallet door</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Connect OCEAN intent.</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Sign a wallet intent for the future OCEAN lock lane. This records interest; it does not stake tokens or issue credits yet.
            </p>
          </div>
          <button
            type="button"
            onClick={connectWallet}
            disabled={isConnecting}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
            {address ? "Wallet connected" : "Connect wallet"}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
            <div className="grid gap-3">
              <Field label="Label" value={holderLabel} onChange={setHolderLabel} />
              <Field label="OCEAN amount" value={oceanAmount} onChange={setOceanAmount} inputMode="decimal" />
              <Field label="Lock days" value={lockDays} onChange={setLockDays} inputMode="numeric" />
            </div>
            <button
              type="button"
              onClick={signIntent}
              disabled={isSigning || !address}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-fish-accent/35 px-6 text-sm font-black text-fish-accent transition hover:bg-fish-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PenLine className="h-4 w-4" aria-hidden="true" />}
              Sign intent
            </button>
            {error ? <div className="mt-4 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black text-fish-primary">{error}</div> : null}
            {notice ? <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm font-black text-emerald-100">{notice}</div> : null}
          </div>

          <div className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Wallet" value={address ? formatEvmAddress(address) : "Not connected"} />
              <Metric label="Chain" value={chainId ? String(chainId) : "-"} />
              <Metric label="Estimated credits" value={formatNumber(estimatedCredits)} />
              <Metric label="Credit state" value="Not issued" />
            </div>
            {intent ? (
              <div className="mt-4 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Intent recorded</p>
                <p className="mt-2 break-all text-sm font-black text-white">{intent.intentId}</p>
                <p className="mt-2 text-sm font-bold text-fish-secondary">
                  {intent.addressPrefix} / {formatNumber(intent.oceanAmount)} OCEAN / {formatNumber(intent.lockDays)} days / {formatDateTime(intent.createdAt)}
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-fish-accent/20 p-4 text-sm font-bold leading-6 text-fish-secondary">
                Next hard step: deploy an OCEAN lock contract or operator verification flow before these intents can become Fish Credits.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ inputMode, label, onChange, value }: { inputMode?: "decimal" | "numeric"; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        className="mt-2 h-11 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-fish-navy950/45 p-4">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}
