"use client";

import { BadgeDollarSign, KeyRound, Loader2, ReceiptText, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";

type AccountPayload = {
  account: {
    label: string;
    creditBalance: number;
    totalCreditsGranted: number;
    totalCreditsSpent: number;
    requestCount: number;
    lastUsedAt: string | null;
  };
  totals: {
    requests: number;
    creditsSpent: number;
    creditsRemaining: number;
    userChargeUsd: number;
    providerCostUsd: number;
    grossMarginUsd: number;
  };
  creditLanes: CreditLaneSummary[];
};

type Receipt = {
  id: string;
  creditEntryId?: string | null;
  creditLane?: string;
  createdAt: string;
  model: string;
  route: "mock" | "ocean-provider" | "external-fallback";
  costState: "prototype_estimate" | "provider_verified" | "fallback_verified";
  totalTokens: number;
  creditsSpent: number;
  userChargeUsd: number;
  providerCostUsd: number;
  grossMarginUsd: number;
  providerId: string | null;
  requestHash: string;
};

type CreditLaneSummary = {
  lane: string;
  balance: number;
  granted: number;
  spent: number;
  refunds: number;
  adjustments: number;
  entries: number;
  expiresAt: string | null;
};

function getErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    return error?.message ?? "request_failed";
  }
  return "request_failed";
}

export function FishAccountPanel() {
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function refreshAccount() {
    const key = apiKey.trim();
    if (!key) {
      setError("Add a Fish API key.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const headers = { authorization: `Bearer ${key}` };
      const [balanceResponse, usageResponse] = await Promise.all([fetch("/v1/balance", { headers }), fetch("/v1/usage", { headers })]);
      const [balancePayload, usagePayload] = await Promise.all([balanceResponse.json(), usageResponse.json()]);
      if (!balanceResponse.ok) {
        throw new Error(getErrorMessage(balancePayload));
      }
      if (!usageResponse.ok) {
        throw new Error(getErrorMessage(usagePayload));
      }
      setAccount(balancePayload);
      setReceipts(Array.isArray(usagePayload.data) ? usagePayload.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
      setAccount(null);
      setReceipts([]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Account key</p>
            <h2 className="text-2xl font-black text-white">Open your tab</h2>
          </div>
        </div>

        <label className="block text-sm font-black text-fish-primary" htmlFor="fish-account-key">
          Fish API key
        </label>
        <input
          id="fish-account-key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          type="password"
          autoComplete="off"
          placeholder="fish_sk_..."
          className="mt-2 h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
        />

        <button
          type="button"
          onClick={refreshAccount}
          disabled={isLoading}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
          Refresh tab
        </button>

        {error ? (
          <div className="mt-4 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black text-fish-primary" role="alert">
            {error}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
          Fish reads the key for this request only. Receipts show hashes and usage numbers, not prompt text.
        </div>
      </div>

      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Credit tab</p>
              <h2 className="text-2xl font-black text-white">{account?.account.label ?? "No tab open"}</h2>
            </div>
          </div>
          <span className="rounded-full border border-fish-accent/20 bg-fish-accent/10 px-3 py-1 text-xs font-black text-fish-accent">{formatNumber(account?.totals.requests ?? 0)} catches</span>
        </div>

        {account ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Credits left" value={formatNumber(account.totals.creditsRemaining)} />
              <Metric label="Credits spent" value={formatNumber(account.totals.creditsSpent)} />
              <Metric label="Granted" value={formatNumber(account.account.totalCreditsGranted)} />
              <Metric label="Last used" value={formatDateTime(account.account.lastUsedAt)} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="User charge" value={formatUsd(account.totals.userChargeUsd)} />
              <Metric label="Provider cost" value={formatUsd(account.totals.providerCostUsd)} />
              <Metric label="Gross margin" value={formatUsd(account.totals.grossMarginUsd)} />
            </div>
            <CreditLaneNet lanes={account.creditLanes} />
            <ReceiptNet receipts={receipts} />
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-8 text-center">
            <p className="max-w-sm text-xl font-black leading-8 text-fish-primary">Paste a pilot key to see credits, receipts, and route costs.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreditLaneNet({ lanes }: { lanes: CreditLaneSummary[] }) {
  const visibleLanes = lanes.length ? lanes : [{ lane: "grant", balance: 0, granted: 0, spent: 0, refunds: 0, adjustments: 0, entries: 0, expiresAt: null }];
  return (
    <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <div className="mb-3 flex items-center gap-3">
        <BadgeDollarSign className="h-5 w-5 text-fish-accent" aria-hidden="true" />
        <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Credit lanes</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {visibleLanes.map((lane) => (
          <div key={lane.lane} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{lane.lane}</p>
            <p className="mt-2 text-2xl font-black text-white">{formatNumber(lane.balance)}</p>
            <p className="mt-1 text-xs font-bold text-fish-secondary">
              {formatNumber(lane.granted)} in / {formatNumber(lane.spent)} spent
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceiptNet({ receipts }: { receipts: Receipt[] }) {
  return (
    <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <div className="mb-3 flex items-center gap-3">
        <ReceiptText className="h-5 w-5 text-fish-accent" aria-hidden="true" />
        <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Receipt net</p>
      </div>
      {receipts.length ? (
        <div className="space-y-2">
          {receipts.slice(0, 8).map((receipt) => (
            <div key={receipt.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-black text-white">{receipt.model}</p>
                <p className="mt-1 break-all text-xs font-bold leading-5 text-fish-secondary">
                  {receipt.route.replaceAll("-", " ")} / {receipt.creditLane ?? "grant"} / {receipt.costState.replaceAll("_", " ")} / {receipt.requestHash.slice(0, 24)}...
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="font-black text-fish-primary">{formatNumber(receipt.creditsSpent)} credit{receipt.creditsSpent === 1 ? "" : "s"}</p>
                <p className="text-xs font-bold text-fish-secondary">{formatDateTime(receipt.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-fish-accent/20 p-5 text-sm font-black text-fish-primary">No receipts yet.</div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}
