"use client";

import { BadgeDollarSign, KeyRound, Loader2, ReceiptText, RefreshCcw, RotateCw, Save, ShieldX } from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";

type AccountPayload = {
  account: {
    label: string;
    status: "active" | "revoked";
    revokedAt: string | null;
    rotatedAt: string | null;
    planId: string;
    planActivatedAt: string | null;
    planExpiresAt: string | null;
    planSource: "pilot_key" | "operator_subscription" | null;
    plan: FishPlan;
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
  privacy?: {
    acceptedPrivacyMode?: string;
    privacyDowngradeReason?: string | null;
    rawPromptSentTo?: string;
    storesPromptText?: false;
    storesOutputText?: false;
  };
  createdAt: string;
  model: string;
  route: "mock" | "ocean-demo-vllm" | "ocean-provider" | "external-fallback";
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

type FishPlan = {
  planId: string;
  label: string;
  state: "prototype" | "future";
  monthlyCreditGrant: number;
  rateLimitPerMinute: number;
  monthlyRequestLimit: number;
  maxStoredThreadItems: number;
  allowedModels: string[];
  externalFallbackAllowed: boolean;
  oceanProviderAllowed: boolean;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);

  async function refreshAccount() {
    const key = apiKey.trim();
    if (!key) {
      setError("Add a Fish API key.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);
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
      setKeyLabel(balancePayload.account?.label ?? "");
      setReceipts(Array.isArray(usagePayload.data) ? usagePayload.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
      setAccount(null);
      setReceipts([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateCurrentKey(options: { rotate?: boolean }) {
    const key = apiKey.trim();
    if (!key) {
      setError("Add a Fish API key.");
      return;
    }
    if (!account || account.account.status === "revoked") {
      setError("Open an active key first.");
      return;
    }

    const nextLabel = keyLabel.trim();
    setIsUpdatingKey(true);
    setError(null);
    setNotice(null);
    setNewKey(null);
    try {
      const response = await fetch("/v1/api_keys/current", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          label: nextLabel || account.account.label,
          rotate: Boolean(options.rotate)
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }
      setAccount((current) =>
        current
          ? {
              ...current,
              account: {
                ...current.account,
                ...payload.account
              }
            }
          : current
      );
      setKeyLabel(payload.account?.label ?? nextLabel);
      if (payload.key) {
        setApiKey(payload.key);
        setNewKey(payload.key);
        setNotice("Key rotated. The old key no longer works.");
      } else {
        setNotice("Key label updated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setIsUpdatingKey(false);
    }
  }

  async function revokeCurrentKey() {
    const key = apiKey.trim();
    if (!key) {
      setError("Add a Fish API key.");
      return;
    }
    if (!account || account.account.status === "revoked") {
      setError("No active key is open.");
      return;
    }

    setIsRevoking(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/v1/api_keys/current", {
        method: "DELETE",
        headers: { authorization: `Bearer ${key}` }
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }
      setAccount((current) =>
        current
          ? {
              ...current,
              account: {
                ...current.account,
                status: payload.account?.status ?? "revoked",
                revokedAt: payload.account?.revokedAt ?? new Date().toISOString()
              }
            }
          : current
      );
      setApiKey("");
      setNotice("Key revoked. Existing receipts stay visible, but this key cannot be used again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setIsRevoking(false);
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
        {notice ? <div className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm font-black text-emerald-100">{notice}</div> : null}

        <div className="mt-5 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
          Fish reads the key for this check only. Activity rows show usage numbers, not prompt text.
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
          <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${account?.account.status === "revoked" ? "border-fish-coral/30 bg-fish-coral/10 text-fish-coral" : "border-fish-accent/20 bg-fish-accent/10 text-fish-accent"}`}>
            {account ? account.account.status : `${formatNumber(0)} uses`}
          </span>
        </div>

        {account ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Credits left" value={formatNumber(account.totals.creditsRemaining)} />
              <Metric label="Credits spent" value={formatNumber(account.totals.creditsSpent)} />
              <Metric label="Requests" value={formatNumber(account.totals.requests)} />
              <Metric label="Granted" value={formatNumber(account.account.totalCreditsGranted)} />
              <Metric label="Last used" value={formatDateTime(account.account.lastUsedAt)} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="User charge" value={formatUsd(account.totals.userChargeUsd)} />
              <Metric label="Provider cost" value={formatUsd(account.totals.providerCostUsd)} />
              <Metric label="Gross margin" value={formatUsd(account.totals.grossMarginUsd)} />
            </div>
            <div className="flex flex-col gap-3 rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Key status</p>
                <p className="mt-1 text-sm font-bold text-fish-secondary">
                  {account.account.status === "revoked" ? `Revoked ${formatDateTime(account.account.revokedAt)}` : "Active key. Revoke it if this key was shared or no longer needed."}
                </p>
                <p className="mt-1 text-xs font-bold text-fish-secondary">Last rotated {formatDateTime(account.account.rotatedAt)}</p>
              </div>
              <button
                type="button"
                onClick={revokeCurrentKey}
                disabled={isRevoking || account.account.status === "revoked"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-coral/35 px-5 text-xs font-black text-fish-coral transition hover:bg-fish-coral/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldX className="h-4 w-4" aria-hidden="true" />}
                Revoke key
              </button>
            </div>
            <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
                <div>
                  <label className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold" htmlFor="fish-key-label">
                    Key label
                  </label>
                  <input
                    id="fish-key-label"
                    value={keyLabel}
                    onChange={(event) => setKeyLabel(event.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => updateCurrentKey({ rotate: false })}
                  disabled={isUpdatingKey || account.account.status === "revoked"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-accent/35 px-5 text-xs font-black text-fish-accent transition hover:bg-fish-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUpdatingKey ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  Save label
                </button>
                <button
                  type="button"
                  onClick={() => updateCurrentKey({ rotate: true })}
                  disabled={isUpdatingKey || account.account.status === "revoked"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-gold/35 px-5 text-xs font-black text-fish-gold transition hover:bg-fish-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUpdatingKey ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCw className="h-4 w-4" aria-hidden="true" />}
                  Rotate key
                </button>
              </div>
              {newKey ? (
                <div className="mt-4 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">New key shown once</p>
                  <input readOnly value={newKey} className="mt-2 h-11 w-full rounded-2xl border border-fish-gold/25 bg-fish-navy950/70 px-4 font-mono text-xs font-bold text-white outline-none" />
                </div>
              ) : null}
            </div>
            <PlanDock account={account.account} />
            <CreditLaneNet lanes={account.creditLanes} />
            <ReceiptNet receipts={receipts} />
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-8 text-center">
            <p className="max-w-sm text-xl font-black leading-8 text-fish-primary">Paste a pilot key to see credits and recent use.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanDock({ account }: { account: AccountPayload["account"] }) {
  const plan = account.plan;
  return (
    <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Plan</p>
          <h3 className="mt-2 text-2xl font-black text-white">{plan.label}</h3>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${plan.state === "prototype" ? "bg-emerald-400/15 text-emerald-200" : "bg-fish-gold/15 text-fish-gold"}`}>
          {plan.state === "prototype" ? "pilot" : plan.state}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Monthly grant" value={formatNumber(plan.monthlyCreditGrant)} />
        <MiniMetric label="Rate limit" value={`${formatNumber(plan.rateLimitPerMinute)}/min`} />
        <MiniMetric label="Monthly limit" value={formatNumber(plan.monthlyRequestLimit)} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Plan source" value={formatPlanSource(account.planSource)} />
        <MiniMetric label="Started" value={formatDateTime(account.planActivatedAt)} />
        <MiniMetric label="Expires" value={formatDateTime(account.planExpiresAt)} />
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
        <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Credit buckets</p>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function ReceiptNet({ receipts }: { receipts: Receipt[] }) {
  return (
    <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <div className="mb-3 flex items-center gap-3">
        <ReceiptText className="h-5 w-5 text-fish-accent" aria-hidden="true" />
        <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Recent use</p>
      </div>
      {receipts.length ? (
        <div className="space-y-2">
          {receipts.slice(0, 8).map((receipt) => (
            <div key={receipt.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-black text-white">{receipt.model}</p>
                <p className="mt-1 break-all text-xs font-bold leading-5 text-fish-secondary">
                  {formatRoute(receipt.route)} / {receipt.creditLane ?? "grant"} / {formatCostState(receipt.costState)} / {formatPrivacy(receipt.privacy?.acceptedPrivacyMode)}
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
        <div className="rounded-2xl border border-dashed border-fish-accent/20 p-5 text-sm font-black text-fish-primary">No activity yet.</div>
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

function formatRoute(route: Receipt["route"]) {
  if (route === "mock") {
    return "demo";
  }
  if (route === "ocean-demo-vllm") {
    return "Ocean demo";
  }
  if (route === "external-fallback") {
    return "outside AI";
  }
  return "Ocean provider";
}

function formatCostState(state: Receipt["costState"]) {
  if (state === "prototype_estimate") {
    return "estimate";
  }
  if (state === "fallback_verified") {
    return "outside AI";
  }
  return "provider checked";
}

function formatPrivacy(mode: string | undefined) {
  if (!mode) {
    return "privacy label";
  }
  if (mode === "local_demo") {
    return "local demo";
  }
  if (mode === "external_policy") {
    return "outside policy";
  }
  if (mode === "ocean_demo_policy") {
    return "Ocean demo policy";
  }
  if (mode === "selected_ocean_policy") {
    return "Ocean policy";
  }
  if (mode === "hash_only_batch") {
    return "hash-only docs";
  }
  if (mode === "ocean_hardened") {
    return "hardened runner";
  }
  if (mode === "ocean_tee") {
    return "hardware proof";
  }
  if (mode === "e2ee_to_tee") {
    return "end-to-end private";
  }
  return mode.replaceAll("_", " ");
}

function formatPlanSource(source: AccountPayload["account"]["planSource"]) {
  if (source === "operator_subscription") {
    return "pilot subscription";
  }
  return "pilot key";
}
