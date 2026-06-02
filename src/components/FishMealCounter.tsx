"use client";

import {
  Code2,
  FileText,
  Fish,
  ImageIcon,
  KeyRound,
  Lightbulb,
  Loader2,
  MessageSquareText,
  PenTool,
  Send,
  Sparkles,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FISH_DISHES, type FishDishDefinition } from "@/lib/fishDishes";

const MODEL_STORAGE_KEY = "fish-meal-counter-model-v1";
const DISH_STORAGE_KEY = "fish-meal-counter-active-v1";

type FishModel = {
  id: string;
  owned_by?: string;
  description?: string;
};

type FishDish = FishDishDefinition & {
  icon: LucideIcon;
  disabled?: boolean;
};

type FishRoutePolicySummary = {
  activeRoute?: {
    id: string;
    label: string;
    isRealAi: boolean;
  };
  backend?: {
    oceanBatchConfigured?: boolean;
  };
  guardrails?: {
    maxOutputTokens: number;
  };
};

type DishResult = {
  dishTitle: string;
  content: string;
  model: string;
  route?: string;
  requestedRoute?: string;
  fallbackFrom?: string | null;
  fallbackReason?: string | null;
  costState?: string;
  receiptId?: string;
  creditsSpent?: number;
  creditsRemaining?: number;
  userChargeUsd?: number;
  providerCostUsd?: number;
  totalTokens?: number;
  quotaRemaining?: number;
  privacyMode?: string;
  privacyDowngradeReason?: string | null;
  rawPromptSentTo?: string;
  batchReceiptId?: string;
  batchJobId?: string;
  batchSourceState?: string;
  batchAdapterMode?: string;
  inputRef?: string;
  knowledgeSources?: Array<{
    id: string;
    title: string;
    source: string;
  }>;
  accessMode: "guest" | "key";
};

const dishIcons: Record<string, LucideIcon> = {
  ask: MessageSquareText,
  code: Code2,
  explain: Lightbulb,
  docs: FileText,
  images: ImageIcon,
  proposal: PenTool,
  ocean: Waves
};

const dishes: FishDish[] = FISH_DISHES.map((dish) => ({
  ...dish,
  icon: dishIcons[dish.id] ?? MessageSquareText,
  disabled: !dish.enabled
}));

function readStoredModel() {
  if (typeof window === "undefined") {
    return "fish-demo-chat";
  }
  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY) || "fish-demo-chat";
  } catch {
    return "fish-demo-chat";
  }
}

function readStoredDish() {
  if (typeof window === "undefined") {
    return "ask";
  }
  try {
    const stored = window.localStorage.getItem(DISH_STORAGE_KEY);
    return dishes.some((dish) => dish.id === stored) ? stored ?? "ask" : "ask";
  } catch {
    return "ask";
  }
}

function getErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string; needed?: number; available?: number } }).error;
    if (error?.message === "insufficient_fish_credits") {
      return `Not enough Fish credits. Needed ${error.needed ?? "more"}, available ${error.available ?? 0}.`;
    }
    return error?.message?.replaceAll("_", " ") ?? "Request failed.";
  }
  return "Request failed.";
}

export function FishMealCounter() {
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<FishModel[]>([{ id: "fish-demo-chat", owned_by: "ocean-navy" }]);
  const [selectedModel, setSelectedModel] = useState("fish-demo-chat");
  const [activeDishId, setActiveDishId] = useState("ask");
  const [routePolicy, setRoutePolicy] = useState<FishRoutePolicySummary | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<DishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeDish = useMemo(() => dishes.find((dish) => dish.id === activeDishId) ?? dishes[0], [activeDishId]);
  const ActiveIcon = activeDish.icon;
  const maxOutputTokens = routePolicy?.guardrails?.maxOutputTokens ?? 512;
  const orderMaxTokens = Math.min(activeDish.maxTokens, maxOutputTokens);
  const currentRouteLabel = routePolicy?.activeRoute?.label ? formatRouteLabel(routePolicy.activeRoute.label) : activeDish.routeLabel;

  useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedModel(readStoredModel());
      setActiveDishId(readStoredDish());
    });

    fetch("/v1/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload && Array.isArray(payload.data) && payload.data.length) {
          setModels(payload.data);
          setSelectedModel((current) => (payload.data.some((model: FishModel) => model.id === current) ? current : payload.data[0].id));
        }
      })
      .catch(() => undefined);

    fetch("/api/routing/policy")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload && typeof payload === "object") {
          setRoutePolicy(payload as FishRoutePolicySummary);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
      window.localStorage.setItem(DISH_STORAGE_KEY, activeDishId);
    } catch {
      // Local storage can be unavailable in strict browser modes.
    }
  }, [activeDishId, selectedModel]);

  function selectDish(dishId: string) {
    const nextDish = dishes.find((dish) => dish.id === dishId) ?? dishes[0];
    if (nextDish.disabled) {
      setError(`${nextDish.title} is coming soon.`);
      return;
    }
    setActiveDishId(nextDish.id);
    if (models.some((model) => model.id === nextDish.modelAlias)) {
      setSelectedModel(nextDish.modelAlias);
    }
    setError(null);
    setPrompt((current) => current || nextDish.placeholder);
  }

  async function sendPrompt() {
    const key = apiKey.trim();
    const userPrompt = prompt.trim();
    if (activeDish.disabled) {
      setError(`${activeDish.title} is coming soon.`);
      return;
    }
    if (!userPrompt) {
      setError("Add a prompt for this dish.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const accessMode = key ? "key" : "guest";
      const response = await fetch(`/api/dishes/${activeDish.id}/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(key ? { authorization: `Bearer ${key}` } : {})
        },
        body: JSON.stringify({
          prompt: userPrompt,
          model: selectedModel,
          max_tokens: orderMaxTokens,
          metadata: {
            fish_client: "meal-counter"
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      setResult({
        dishTitle: activeDish.title,
        content: payload.choices?.[0]?.message?.content ?? "",
        model: payload.model ?? selectedModel,
        route: payload.fish?.route,
        requestedRoute: payload.fish?.requestedRoute,
        fallbackFrom: payload.fish?.fallbackFrom,
        fallbackReason: payload.fish?.fallbackReason,
        costState: payload.fish?.costState,
        receiptId: payload.fish?.receiptId,
        creditsSpent: payload.fish?.creditsSpent,
        creditsRemaining: payload.fish?.creditsRemaining,
        userChargeUsd: payload.fish?.userChargeUsd,
        providerCostUsd: payload.fish?.providerCostUsd,
        totalTokens: payload.usage?.total_tokens,
        quotaRemaining: payload.fish?.quotaRemaining,
        privacyMode: payload.fish?.privacy?.acceptedPrivacyMode,
        privacyDowngradeReason: payload.fish?.privacy?.privacyDowngradeReason,
        rawPromptSentTo: payload.fish?.privacy?.rawPromptSentTo,
        batchReceiptId: payload.fish?.batchReceiptId,
        batchJobId: payload.fish?.batchJobId,
        batchSourceState: payload.fish?.batchSourceState,
        batchAdapterMode: payload.fish?.batchAdapterMode,
        inputRef: payload.fish?.inputRef,
        knowledgeSources: Array.isArray(payload.fish?.knowledgeSources) ? payload.fish.knowledgeSources : undefined,
        accessMode
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createDocsBatchReceipt() {
    const key = apiKey.trim();
    const userPrompt = prompt.trim();
    if (activeDish.id !== "docs") {
      setError("Batch receipts are for Docs Bento.");
      return;
    }
    if (!key) {
      setError("Add a Fish API key for batch receipts.");
      return;
    }
    if (!userPrompt) {
      setError("Add docs or notes first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const inputRef = await sha256Ref(userPrompt);
      const adapterMode = routePolicy?.backend?.oceanBatchConfigured ? "ocean_http" : "sample_success";
      const response = await fetch("/api/ocean/batch/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          taskType: "document_summary",
          inputRef,
          estimatedInputTokens: estimateInputTokens(userPrompt),
          maxOutputTokens: Math.min(orderMaxTokens, 512),
          maxRuntimeSeconds: 600,
          maxCostUsd: 1,
          adapterMode
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      const receipt = payload.receipt;
      const usageReceipt = payload.usageReceipt;
      const sourceState = receipt?.sourceState ?? "sample";
      setResult({
        dishTitle: activeDish.title,
        content:
          sourceState === "snapshot"
            ? "Docs batch receipt created. Fish sent a hash-only job reference to the private batch adapter."
            : "Sample Docs batch receipt created. Fish kept this hash-only while the private Ocean batch adapter is not configured.",
        model: receipt?.model ?? "ocean-batch-placeholder",
        route: usageReceipt?.route ?? "ocean-provider",
        costState: usageReceipt?.costState ?? receipt?.cost?.pricingState,
        receiptId: usageReceipt?.id,
        creditsSpent: usageReceipt?.creditsSpent,
        creditsRemaining: payload.creditsRemaining,
        userChargeUsd: usageReceipt?.userChargeUsd,
        providerCostUsd: receipt?.cost?.providerCostUsd,
        totalTokens: receipt?.usage?.totalTokens,
        privacyMode: payload.fish?.privacy?.acceptedPrivacyMode ?? usageReceipt?.privacy?.acceptedPrivacyMode,
        privacyDowngradeReason: payload.fish?.privacy?.privacyDowngradeReason ?? usageReceipt?.privacy?.privacyDowngradeReason,
        rawPromptSentTo: payload.fish?.privacy?.rawPromptSentTo ?? usageReceipt?.privacy?.rawPromptSentTo,
        batchReceiptId: receipt?.receiptId,
        batchJobId: receipt?.jobId,
        batchSourceState: sourceState,
        batchAdapterMode: receipt?.adapterMode,
        inputRef,
        accessMode: "key"
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-4">
        <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">AI menu</p>
              <h2 className="text-3xl font-black text-white">Pick a dish.</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {dishes.map((dish) => {
              const Icon = dish.icon;
              const isActive = dish.id === activeDish.id;
              return (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => selectDish(dish.id)}
                  aria-pressed={isActive}
                  disabled={Boolean(dish.disabled)}
                  className={`group min-h-40 rounded-[1.5rem] border p-4 text-left transition ${
                    isActive
                      ? "border-fish-accent bg-fish-accent/10 ring-2 ring-fish-accent/25"
                      : dish.disabled
                        ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-65"
                      : "border-fish-accent/18 bg-white/[0.035] hover:border-fish-accent/55"
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-navy950/70 text-fish-accent ring-1 ring-fish-accent/25">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-gold">
                      {dish.status}
                    </span>
                  </span>
                  <span className="mt-4 block text-2xl font-black text-white">{dish.title}</span>
                  <span className="mt-1 block text-sm font-black text-fish-accent">{dish.subtitle}</span>
                  <span className="mt-2 block text-sm font-bold leading-6 text-fish-secondary">{dish.short}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <a className="rounded-[1.25rem] border border-fish-accent/18 bg-fish-navy950/45 p-4 transition hover:border-fish-accent/55" href="/api">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">API</span>
              <span className="mt-2 block text-xl font-black text-white">One key</span>
              <span className="mt-1 block text-sm font-bold leading-6 text-fish-secondary">Use Fish from your app.</span>
            </a>
            <a className="rounded-[1.25rem] border border-fish-accent/18 bg-fish-navy950/45 p-4 transition hover:border-fish-accent/55" href="/dashboard">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">Dashboard</span>
              <span className="mt-2 block text-xl font-black text-white">See supply</span>
              <span className="mt-1 block text-sm font-bold leading-6 text-fish-secondary">Ocean GPUs, usage, and route split.</span>
            </a>
          </div>
        </div>

        <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Pilot access</p>
              <h2 className="text-2xl font-black text-white">Free taste or API key</h2>
            </div>
          </div>

          <label className="block text-sm font-black text-fish-primary" htmlFor="fish-meal-api-key">
            Fish API key <span className="text-fish-secondary">(optional)</span>
          </label>
          <input
            id="fish-meal-api-key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            autoComplete="off"
            placeholder="Leave empty for a small daily demo"
            className="mt-2 h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
          />

          <label className="mt-5 block text-sm font-black text-fish-primary" htmlFor="fish-meal-model">
            Model
          </label>
          <select
            id="fish-meal-model"
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-black text-white outline-none transition focus:border-fish-accent"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatusTile label="Dish" value={activeDish.status} />
            <StatusTile label="Route" value={result?.route ? formatBadge(result.route) : currentRouteLabel} />
            <StatusTile label="Access" value={apiKey.trim() ? "API key" : "Free taste"} />
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent text-fish-navy950">
              <ActiveIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">{activeDish.status}</p>
              <h2 className="text-3xl font-black text-white">{activeDish.title}</h2>
              <p className="mt-1 text-sm font-black text-fish-accent">{activeDish.subtitle}</p>
            </div>
          </div>
          <span className="inline-flex h-9 items-center rounded-full border border-fish-accent/25 bg-fish-accent/10 px-3 text-xs font-black uppercase tracking-[0.08em] text-fish-accent">
            {currentRouteLabel}
          </span>
        </div>

        <label className="mt-6 block text-sm font-black text-fish-primary" htmlFor="fish-meal-prompt">
          Order
        </label>
        <textarea
          id="fish-meal-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={7}
          placeholder={activeDish.placeholder}
          className="mt-2 w-full resize-none rounded-[1.5rem] border border-fish-accent/25 bg-fish-navy950/70 p-4 text-base font-bold leading-7 text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
        />

        {error ? (
          <div className="mt-4 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black text-fish-primary" role="alert">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={sendPrompt}
            disabled={isLoading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Place order
          </button>
          <button
            type="button"
            onClick={() => {
              setPrompt(activeDish.placeholder);
              setError(null);
            }}
            className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/30 px-5 text-sm font-black text-fish-accent hover:border-fish-accent hover:text-white"
          >
            Use sample
          </button>
        </div>

        {activeDish.id === "docs" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
              Batch receipts use a hash of your docs, not the raw text.
            </div>
            <button
              type="button"
              onClick={createDocsBatchReceipt}
              disabled={isLoading}
              className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/30 px-5 text-sm font-black text-fish-accent hover:border-fish-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Batch receipt
            </button>
          </div>
        ) : null}

        <div className="mt-5 rounded-[1.5rem] border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
          No key needed for a small daily demo. API keys unlock balances, usage history, and higher caps.
        </div>

        <div className="mt-5 min-h-80 rounded-[1.5rem] border border-fish-accent/18 bg-fish-navy950/45 p-5">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center gap-3 text-sm font-black text-fish-primary">
              <Loader2 className="h-5 w-5 animate-spin text-fish-accent" aria-hidden="true" />
              Fish is preparing your dish...
            </div>
          ) : result ? (
            <article>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-fish-accent/15 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-accent">{result.dishTitle}</span>
                <span className="rounded-full border border-fish-accent/20 px-3 py-1 text-xs font-black text-fish-secondary">{result.model}</span>
                {result.route ? <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-xs font-black text-fish-gold">{formatBadge(result.route)}</span> : null}
              </div>
              <p className="whitespace-pre-wrap text-base font-bold leading-7 text-white">{result.content}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric label="Credits spent" value={String(result.creditsSpent ?? 0)} />
                <Metric label="Credits left" value={String(result.creditsRemaining ?? 0)} />
                <Metric label="Tokens" value={String(result.totalTokens ?? 0)} />
                <Metric label={result.accessMode === "guest" ? "Orders left" : "User price"} value={result.accessMode === "guest" ? String(result.quotaRemaining ?? 0) : `$${(result.userChargeUsd ?? 0).toFixed(4)}`} />
                <Metric label="Privacy" value={formatBadge(result.privacyMode ?? "route label")} />
                <Metric label="Prompt path" value={formatBadge(result.rawPromptSentTo ?? "not stored")} />
              </div>
              {result.privacyDowngradeReason ? (
                <p className="mt-3 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-black leading-6 text-fish-primary">
                  Privacy mode changed: {formatBadge(result.privacyDowngradeReason)}.
                </p>
              ) : null}
              {result.fallbackFrom ? (
                <p className="mt-3 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-black leading-6 text-fish-primary">
                  Route changed: {formatBadge(result.fallbackFrom)} to {formatBadge(result.route ?? "")}
                  {result.fallbackReason ? ` (${formatBadge(result.fallbackReason)})` : ""}.
                </p>
              ) : null}
              {result.receiptId ? (
                <p className="mt-3 break-all rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-xs font-bold leading-6 text-fish-secondary">
                  Activity id: <span className="text-fish-accent">{result.receiptId}</span>
                </p>
              ) : null}
              {result.batchReceiptId ? (
                <div className="mt-3 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-xs font-bold leading-6 text-fish-secondary">
                  <p>
                    Batch receipt: <span className="break-all text-fish-accent">{result.batchReceiptId}</span>
                  </p>
                  <p>
                    Job: <span className="break-all text-fish-primary">{result.batchJobId}</span>
                  </p>
                  <p>
                    State: <span className="text-fish-primary">{formatBadge(result.batchSourceState ?? "")}</span> / {formatBadge(result.batchAdapterMode ?? "")}
                  </p>
                  <p>
                    Input ref: <span className="break-all text-fish-primary">{result.inputRef}</span>
                  </p>
                </div>
              ) : null}
              {result.knowledgeSources?.length ? (
                <div className="mt-3 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-xs font-bold leading-6 text-fish-secondary">
                  <p className="font-black uppercase tracking-[0.08em] text-fish-gold">Context used</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.knowledgeSources.map((source) => (
                      <span key={source.id} className="rounded-full border border-fish-accent/20 px-3 py-1 text-fish-primary" title={source.source}>
                        {source.title}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ) : (
            <div className="grid h-64 place-items-center text-center">
              <div>
                <Fish className="mx-auto h-10 w-10 text-fish-accent" aria-hidden="true" />
                <p className="mx-auto mt-4 max-w-sm text-xl font-black leading-8 text-fish-primary">Choose a dish and place a small order.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function formatBadge(value: string) {
  if (value === "mock") {
    return "demo";
  }
  if (value === "external-fallback") {
    return "outside AI";
  }
  if (value === "prototype_estimate") {
    return "estimate";
  }
  if (value === "fallback_verified") {
    return "outside AI";
  }
  if (value === "provider_verified") {
    return "provider checked";
  }
  return value.replaceAll("-", " ").replaceAll("_", " ");
}

function formatRouteLabel(value: string) {
  if (value === "Demo mock") {
    return "Demo";
  }
  if (value === "Ocean demo vLLM") {
    return "Ocean demo";
  }
  if (value === "External fallback") {
    return "Outside AI";
  }
  return value;
}

function estimateInputTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

async function sha256Ref(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
