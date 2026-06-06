"use client";

import { BadgeDollarSign, CreditCard, KeyRound, Loader2, ReceiptText, RefreshCcw, RotateCw, Save, ShieldX, Wallet } from "lucide-react";
import { useState } from "react";
import { formatEvmAddress, parseEvmChainId } from "@/lib/evmWallet";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { FishBillingReadiness } from "@/lib/fishPayments";

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

type FishPayment = {
  paymentId: string;
  provider: "stripe_checkout" | "usdc_base";
  status: "pending" | "paid" | "failed" | "expired";
  credits: number;
  amountUsd: number;
  amountUsdc?: string;
  chainId: number | null;
  tokenAddress: string | null;
  receiveAddress: string | null;
  expiresAt: string | null;
  checkoutUrl: string | null;
  transactionHash: string | null;
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
    const error = (payload as { error?: { message?: string } | string }).error;
    if (typeof error === "string") {
      return error;
    }
    return error?.message ?? "request_failed";
  }
  return "request_failed";
}

export function FishAccountPanel({ initialBillingReadiness }: { initialBillingReadiness: FishBillingReadiness }) {
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
  const [checkoutAmountUsd, setCheckoutAmountUsd] = useState("5");
  const [usdcPayment, setUsdcPayment] = useState<FishPayment | null>(null);
  const [usdcTransactionHash, setUsdcTransactionHash] = useState("");
  const [isStartingStripe, setIsStartingStripe] = useState(false);
  const [isStartingUsdc, setIsStartingUsdc] = useState(false);
  const [isConfirmingUsdc, setIsConfirmingUsdc] = useState(false);
  const [paymentWalletAddress, setPaymentWalletAddress] = useState("");
  const [paymentWalletChainId, setPaymentWalletChainId] = useState<number | null>(null);
  const [isConnectingPaymentWallet, setIsConnectingPaymentWallet] = useState(false);

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

  function readCheckoutAmount() {
    const parsed = Number(checkoutAmountUsd);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Choose a valid top-up amount.");
      return null;
    }
    return Math.round(parsed * 100) / 100;
  }

  async function startStripeCheckout() {
    const key = apiKey.trim();
    const amountUsd = readCheckoutAmount();
    if (!key || !amountUsd) {
      setError(key ? "Choose a valid top-up amount." : "Add a Fish API key.");
      return;
    }
    if (!account || account.account.status === "revoked") {
      setError("Open an active key first.");
      return;
    }

    setIsStartingStripe(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/checkout/stripe", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ amountUsd })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }
      if (!payload.checkoutUrl) {
        throw new Error("stripe_checkout_url_missing");
      }
      window.location.assign(payload.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "stripe_checkout_failed");
    } finally {
      setIsStartingStripe(false);
    }
  }

  async function startUsdcCheckout() {
    const key = apiKey.trim();
    const amountUsd = readCheckoutAmount();
    if (!key || !amountUsd) {
      setError(key ? "Choose a valid top-up amount." : "Add a Fish API key.");
      return;
    }
    if (!account || account.account.status === "revoked") {
      setError("Open an active key first.");
      return;
    }

    setIsStartingUsdc(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/checkout/usdc", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ amountUsd, payerAddress: paymentWalletAddress || undefined })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }
      setUsdcPayment(payload.payment);
      setNotice("USDC payment request created. Send the exact amount, then paste the transaction hash.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "usdc_checkout_failed");
    } finally {
      setIsStartingUsdc(false);
    }
  }

  async function connectPaymentWallet() {
    if (!window.ethereum) {
      setError("No EVM wallet found in this browser.");
      return;
    }

    setIsConnectingPaymentWallet(true);
    setError(null);
    setNotice(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const [first] = Array.isArray(accounts) ? accounts : [];
      if (typeof first !== "string") {
        throw new Error("wallet_account_missing");
      }
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" });
      setPaymentWalletAddress(first);
      setPaymentWalletChainId(parseEvmChainId(rawChainId));
      setNotice("Wallet connected for USDC checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "wallet_connection_failed");
    } finally {
      setIsConnectingPaymentWallet(false);
    }
  }

  async function confirmUsdcCheckout() {
    const key = apiKey.trim();
    if (!key) {
      setError("Add a Fish API key.");
      return;
    }
    if (!usdcPayment) {
      setError("Create a USDC payment first.");
      return;
    }
    const transactionHash = usdcTransactionHash.trim();
    if (!transactionHash) {
      setError("Paste the USDC transaction hash.");
      return;
    }

    setIsConfirmingUsdc(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/billing/checkout/usdc/confirm", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          paymentId: usdcPayment.paymentId,
          transactionHash
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }
      setUsdcPayment(payload.payment);
      setNotice("USDC payment confirmed. Prepaid credits were added.");
      setUsdcTransactionHash("");
      await refreshAccount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "usdc_confirmation_failed");
    } finally {
      setIsConfirmingUsdc(false);
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
            <PaymentDock
              amountUsd={checkoutAmountUsd}
              onAmountChange={setCheckoutAmountUsd}
              onStripeCheckout={startStripeCheckout}
              onUsdcCheckout={startUsdcCheckout}
              onUsdcConfirm={confirmUsdcCheckout}
              usdcPayment={usdcPayment}
              usdcTransactionHash={usdcTransactionHash}
              onUsdcTransactionHashChange={setUsdcTransactionHash}
              isStartingStripe={isStartingStripe}
              isStartingUsdc={isStartingUsdc}
              isConfirmingUsdc={isConfirmingUsdc}
              paymentWalletAddress={paymentWalletAddress}
              paymentWalletChainId={paymentWalletChainId}
              isConnectingPaymentWallet={isConnectingPaymentWallet}
              onConnectPaymentWallet={connectPaymentWallet}
              disabled={account.account.status === "revoked"}
              readiness={initialBillingReadiness}
            />
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

function PaymentDock({
  amountUsd,
  onAmountChange,
  onStripeCheckout,
  onUsdcCheckout,
  onUsdcConfirm,
  usdcPayment,
  usdcTransactionHash,
  onUsdcTransactionHashChange,
  isStartingStripe,
  isStartingUsdc,
  isConfirmingUsdc,
  paymentWalletAddress,
  paymentWalletChainId,
  isConnectingPaymentWallet,
  onConnectPaymentWallet,
  disabled,
  readiness
}: {
  amountUsd: string;
  onAmountChange: (value: string) => void;
  onStripeCheckout: () => void;
  onUsdcCheckout: () => void;
  onUsdcConfirm: () => void;
  usdcPayment: FishPayment | null;
  usdcTransactionHash: string;
  onUsdcTransactionHashChange: (value: string) => void;
  isStartingStripe: boolean;
  isStartingUsdc: boolean;
  isConfirmingUsdc: boolean;
  paymentWalletAddress: string;
  paymentWalletChainId: number | null;
  isConnectingPaymentWallet: boolean;
  onConnectPaymentWallet: () => void;
  disabled: boolean;
  readiness: FishBillingReadiness | null;
}) {
  const numericAmount = Number(amountUsd);
  const creditUsd = readiness?.creditUsd && readiness.creditUsd > 0 ? readiness.creditUsd : 0.001;
  const estimatedCredits = Number.isFinite(numericAmount) && numericAmount > 0 ? Math.floor(numericAmount / creditUsd) : 0;
  const stripeDisabled = disabled || isStartingStripe || readiness?.providers.stripe.enabled !== true;
  const usdcDisabled = disabled || isStartingUsdc || readiness?.providers.usdc.enabled !== true;
  const paymentsOpen = readiness?.checkoutAvailable === true;
  const topupState = paymentsOpen ? "Ready" : readiness?.paidTopupsPaused ? "Paused" : "Waiting";
  const paymentStatusCards = [
    { label: "Checkout", value: paymentsOpen ? "Open" : "Closed" },
    { label: "Top-ups", value: topupState },
    { label: "Liability cap", value: readiness?.liabilityCap.configured ? formatUsd(readiness.liabilityCap.maxOutstandingPrepaidUsd ?? 0) : "Not set" },
    { label: "Support", value: readiness?.customerCare.supportConfigured && readiness.customerCare.refundPolicyConfigured ? "Ready" : "Needed" },
    { label: "Providers", value: readiness?.providers.stripe.configured || readiness?.providers.usdc.configured ? "Configured" : "Not ready" }
  ];

  return (
    <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Add credits</p>
          <h3 className="mt-2 text-2xl font-black text-white">{paymentsOpen ? "Pay for AI dishes." : "Checkout is closed."}</h3>
          <p className="mt-1 text-sm font-bold leading-6 text-fish-secondary">
            {paymentsOpen ? "Credits are issued only after payment confirms." : "Use pilot credits for now. Paid top-ups open only after caps, support, and payment providers are ready."}
          </p>
        </div>
        <div className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-3 text-right">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">Estimate</p>
          <p className="mt-1 text-lg font-black text-white">{formatNumber(estimatedCredits)} credits</p>
        </div>
      </div>
      <div className={`mb-3 rounded-2xl border p-3 text-sm font-bold leading-6 ${paymentsOpen ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-fish-gold/25 bg-fish-gold/10 text-fish-primary"}`}>
        {paymentsOpen ? (
          <span>Payments are open. Card and USDC credits settle only after confirmation.</span>
        ) : (
          <span>Payments are not open yet. {formatBillingBlockers(readiness?.blockers)}</span>
        )}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {paymentStatusCards.map((card) => (
          <MiniMetric key={card.label} label={card.label} value={card.value} />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <label className="block">
          <span className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Amount USD</span>
          <input
            value={amountUsd}
            onChange={(event) => onAmountChange(event.target.value)}
            inputMode="decimal"
            className="mt-2 h-11 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
          />
        </label>
        <button
          type="button"
          onClick={onStripeCheckout}
          disabled={stripeDisabled}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-5 text-xs font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStartingStripe ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
          Pay by card
        </button>
        <button
          type="button"
          onClick={onUsdcCheckout}
          disabled={usdcDisabled}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-accent/35 px-5 text-xs font-black text-fish-accent transition hover:bg-fish-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStartingUsdc ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
          Pay USDC
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">USDC wallet</p>
          <p className="mt-1 text-sm font-black text-white">
            {paymentWalletAddress ? `${formatEvmAddress(paymentWalletAddress)}${paymentWalletChainId ? ` / chain ${paymentWalletChainId}` : ""}` : "Optional, but safer for transfer checks."}
          </p>
        </div>
        <button
          type="button"
          onClick={onConnectPaymentWallet}
          disabled={disabled || isConnectingPaymentWallet}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-fish-gold/35 px-4 text-xs font-black text-fish-gold transition hover:bg-fish-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnectingPaymentWallet ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
          {paymentWalletAddress ? "Change wallet" : "Connect wallet"}
        </button>
      </div>
      {usdcPayment ? (
        <div className="mt-4 rounded-3xl border border-fish-gold/20 bg-fish-gold/10 p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <MiniMetric label="USDC amount" value={`${usdcPayment.amountUsdc ?? formatUsd(usdcPayment.amountUsd)} USDC`} />
            <MiniMetric label="Chain" value={usdcPayment.chainId ? `Base ${usdcPayment.chainId}` : "Base"} />
            <div className="rounded-2xl border border-white/10 bg-fish-navy950/45 p-3 lg:col-span-2">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-secondary">Send to</p>
              <p className="mt-1 break-all font-mono text-xs font-black text-white">{usdcPayment.receiveAddress}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-fish-navy950/45 p-3 lg:col-span-2">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-secondary">Token</p>
              <p className="mt-1 break-all font-mono text-xs font-black text-white">{usdcPayment.tokenAddress}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="block">
              <span className="text-sm font-black uppercase tracking-[0.1em] text-fish-gold">Transaction hash</span>
              <input
                value={usdcTransactionHash}
                onChange={(event) => onUsdcTransactionHashChange(event.target.value)}
                placeholder="0x..."
                className="mt-2 h-11 w-full rounded-2xl border border-fish-gold/25 bg-fish-navy950/70 px-4 font-mono text-xs font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-gold"
              />
            </label>
            <button
              type="button"
              onClick={onUsdcConfirm}
              disabled={disabled || isConfirmingUsdc || usdcPayment.status === "paid"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-fish-gold/35 px-5 text-xs font-black text-fish-gold transition hover:bg-fish-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConfirmingUsdc ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
              {usdcPayment.status === "paid" ? "Confirmed" : "Confirm"}
            </button>
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-fish-secondary">
            Send the exact amount before {formatDateTime(usdcPayment.expiresAt)}. Credits are added after Fish verifies the USDC transfer onchain.
          </p>
        </div>
      ) : null}
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
  if (mode === "ocean_batch_private") {
    return "private batch";
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

function formatBillingBlockers(blockers: string[] | undefined) {
  if (!blockers?.length) {
    return "Setup is still being checked.";
  }
  const labels: Record<string, string> = {
    paid_topups_paused: "Top-ups are paused.",
    paid_credit_liability_cap_not_configured: "The prepaid credit cap is not set.",
    payment_provider_not_configured: "Card or USDC checkout is not configured.",
    billing_support_url_not_configured: "Support contact is not configured.",
    billing_refund_policy_not_configured: "Refund policy is not configured."
  };
  return blockers.map((blocker) => labels[blocker] ?? blocker.replaceAll("_", " ")).join(" ");
}
