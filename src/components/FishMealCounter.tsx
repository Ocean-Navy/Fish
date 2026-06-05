"use client";

import {
  ClipboardCheck,
  Code2,
  Database,
  FileText,
  Fish,
  GitBranch,
  ImageIcon,
  Lightbulb,
  Loader2,
  MessageSquareText,
  PenTool,
  Send,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
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
    status?: string;
  };
  backend?: {
    oceanBatchConfigured?: boolean;
    oceanBatchPrivatePayload?: boolean;
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
  repo: GitBranch,
  eval: ClipboardCheck,
  data: Database,
  images: ImageIcon,
  proposal: PenTool,
  ocean: Waves
};

const dishes: FishDish[] = FISH_DISHES.map((dish) => ({
  ...dish,
  icon: dishIcons[dish.id] ?? MessageSquareText,
  disabled: !dish.enabled
}));
const oceanBatchDishes = dishes.filter((dish) => dish.lane === "batch");
const quickDishes = dishes.filter((dish) => dish.lane === "warm");
const futureDishes = dishes.filter((dish) => dish.lane === "future");
const featuredDishes = [...oceanBatchDishes, ...quickDishes.filter((dish) => dish.id === "ask")];
const moreDishes = [...quickDishes.filter((dish) => dish.id !== "ask"), ...futureDishes];

const dishVisuals: Record<string, { image: string; alt: string }> = {
  ask: {
    image: "/assets/generated/fish-dish-quick-catch.webp",
    alt: "Simple blue fish dish with a glowing answer pearl and Fish tokens in a Venice market"
  },
  code: {
    image: "/assets/generated/fish-dish-code-roll.webp",
    alt: "Sushi roll set with abstract coding shapes, circuit ribbons, and glowing Fish tokens"
  },
  explain: {
    image: "/assets/generated/fish-dish-clear-broth.webp",
    alt: "Clear blue soup with a glowing insight pearl and a small Fish menu plaque"
  },
  docs: {
    image: "/assets/generated/fish-dish-docs-bento.webp",
    alt: "Bento tray with folded documents, blue fish sushi, and glowing Fish tokens in a Venice market"
  },
  repo: {
    image: "/assets/generated/fish-dish-repo-roll.webp",
    alt: "Sushi roll platter with blue fish rolls, abstract code maps, and glowing Fish tokens"
  },
  eval: {
    image: "/assets/generated/fish-dish-eval-platter.webp",
    alt: "Seafood platter with blue fish bites, checkmark symbols, and glowing Fish tokens"
  },
  data: {
    image: "/assets/generated/fish-dish-data-sushi.webp",
    alt: "Sushi tray with blue fish pieces, organized data cubes, pearls, and glowing Fish tokens"
  },
  images: {
    image: "/assets/generated/fish-dish-image-catch.webp",
    alt: "Blue fish dish with glowing picture-frame tiles and color cubes"
  },
  proposal: {
    image: "/assets/generated/fish-dish-proposal-platter.webp",
    alt: "Proposal platter with parchment parcels, a quill garnish, envelope, and glowing Fish tokens"
  },
  ocean: {
    image: "/assets/generated/fish-dish-ocean-special.webp",
    alt: "Ocean routing platter with blue rolls, a glowing wave bowl, compass, and small boats"
  }
};

function routeBadgeLabel(routePolicy: FishRoutePolicySummary | null) {
  const active = routePolicy?.activeRoute;
  if (!active) {
    return "Free taste";
  }
  if (active.status === "paused") {
    return "Paused";
  }
  if (active.status === "needs-config") {
    return "Setup needed";
  }
  return active.isRealAi ? "Live AI" : "Demo mode";
}

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
  const activeVisual = dishVisuals[activeDish.id] ?? dishVisuals.ask;
  const maxOutputTokens = routePolicy?.guardrails?.maxOutputTokens ?? 512;
  const orderMaxTokens = Math.min(activeDish.maxTokens, maxOutputTokens);
  const oceanBatchPrivatePayload = routePolicy?.backend?.oceanBatchPrivatePayload === true;

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

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-4 shadow-harbor sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Menu</p>
            <h2 className="text-3xl font-black text-white">Pick a dish.</h2>
          </div>
          <span className="rounded-full border border-fish-accent/25 bg-fish-accent/10 px-3 py-1 text-xs font-black text-fish-accent">{routeBadgeLabel(routePolicy)}</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {featuredDishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} activeDishId={activeDish.id} onSelect={selectDish} />
          ))}
        </div>

        <details className="mt-4 rounded-[1.5rem] border border-fish-accent/15 bg-white/[0.035] p-4">
          <summary className="cursor-pointer text-sm font-black text-fish-primary">More dishes</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {moreDishes.map((dish) => (
              <DishCard key={dish.id} dish={dish} activeDishId={activeDish.id} onSelect={selectDish} compact />
            ))}
          </div>
        </details>

        <details className="mt-4 rounded-[1.5rem] border border-fish-accent/15 bg-fish-navy950/45 p-4">
          <summary className="cursor-pointer text-sm font-black text-fish-primary">Details</summary>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-black text-fish-primary" htmlFor="fish-meal-api-key">
              Fish API key <span className="text-fish-secondary">(optional)</span>
            </label>
            <input
              id="fish-meal-api-key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              autoComplete="off"
              placeholder="Leave empty for a small demo"
              className="h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
            />

            <label className="block text-sm font-black text-fish-primary" htmlFor="fish-meal-model">
              Model
            </label>
            <select
              id="fish-meal-model"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-black text-white outline-none transition focus:border-fish-accent"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>

            <div className="grid gap-3 sm:grid-cols-3">
              <Link className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-black text-fish-primary hover:border-fish-accent hover:text-white" href={"/privacy" as Route}>
                Data policy
              </Link>
              <Link className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-black text-fish-primary hover:border-fish-accent hover:text-white" href={"/api" as Route}>
                API docs
              </Link>
              <Link className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-black text-fish-primary hover:border-fish-accent hover:text-white" href={"/proof" as Route}>
                Proof
              </Link>
            </div>
          </div>
        </details>
      </section>

      <section className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-4 shadow-harbor sm:p-5">
        <div className="relative aspect-[16/9] overflow-hidden rounded-[1.5rem] border border-fish-accent/20 bg-fish-navy950">
          <Image src={activeVisual.image} alt={activeVisual.alt} fill sizes="(min-width: 1024px) 48vw, 100vw" className="object-cover transition duration-300" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-fish-navy950/92 via-fish-navy950/35 to-transparent p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Your order</p>
            <h2 className="mt-1 text-4xl font-black text-white">{activeDish.title}</h2>
            <p className="mt-1 text-base font-black text-fish-accent">{activeDish.subtitle}</p>
          </div>
        </div>

        <label className="mt-6 block text-sm font-black text-fish-primary" htmlFor="fish-meal-prompt">
          What should Fish make?
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
            Get my result
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

        <details className="mt-5 rounded-[1.5rem] border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
          <summary className="cursor-pointer font-black text-fish-primary">How this order is handled</summary>
          <p className="mt-3">
            {activeDish.oceanBatch
              ? oceanBatchPrivatePayload
                ? "Fish uses your order to make the result. Receipts never show the raw order or answer."
                : "Fish can make a receipt without showing the raw order."
              : "No key needed for a small daily demo. API keys unlock more usage."}
          </p>
        </details>

        <div className="mt-5 min-h-80 rounded-[1.5rem] border border-fish-accent/18 bg-fish-navy950/45 p-5">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center gap-3 text-sm font-black text-fish-primary">
              <Loader2 className="h-5 w-5 animate-spin text-fish-accent" aria-hidden="true" />
              Fish is preparing your dish...
            </div>
          ) : result ? (
            <article>
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Served</p>
                  <h3 className="text-3xl font-black text-white">Your result</h3>
                </div>
                <span className="inline-flex h-9 w-fit items-center rounded-full bg-fish-accent/15 px-3 text-xs font-black uppercase tracking-[0.08em] text-fish-accent">{result.dishTitle}</span>
              </div>
              <ResultContent content={result.content} />
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
              <details className="mt-4 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-xs font-bold leading-6 text-fish-secondary">
                <summary className="cursor-pointer text-sm font-black text-fish-primary">Receipt</summary>
                <div className="mt-3 grid gap-2">
                  <p>
                    Credits left: <span className="text-fish-primary">{result.creditsRemaining ?? 0}</span>
                  </p>
                  <p>
                    {result.accessMode === "guest" ? "Free tastes left" : "Price"}:{" "}
                    <span className="text-fish-primary">{result.accessMode === "guest" ? String(result.quotaRemaining ?? 0) : `$${(result.userChargeUsd ?? 0).toFixed(4)}`}</span>
                  </p>
                  <p>
                    Credits used: <span className="text-fish-primary">{result.creditsSpent ?? 0}</span>
                  </p>
                  <p>
                    Model: <span className="text-fish-primary">{result.model}</span>
                  </p>
                  {result.route ? (
                    <p>
                      Kitchen: <span className="text-fish-primary">{formatBadge(result.route)}</span>
                    </p>
                  ) : null}
                  {result.totalTokens ? (
                    <p>
                      Size: <span className="text-fish-primary">{result.totalTokens} tokens</span>
                    </p>
                  ) : null}
                  {result.privacyMode ? (
                    <p>
                      Privacy: <span className="text-fish-primary">{formatBadge(result.privacyMode)}</span>
                    </p>
                  ) : null}
                  {result.receiptId ? (
                    <p>
                      Activity id: <span className="break-all text-fish-accent">{result.receiptId}</span>
                    </p>
                  ) : null}
                  {result.batchReceiptId ? (
                    <>
                      <p>
                        Batch receipt: <span className="break-all text-fish-accent">{result.batchReceiptId}</span>
                      </p>
                      <p>
                        Batch job: <span className="break-all text-fish-primary">{result.batchJobId}</span>
                      </p>
                      <p>
                        Source: <span className="text-fish-primary">{formatBadge(result.batchSourceState ?? "")}</span> / {formatBadge(result.batchAdapterMode ?? "")}
                      </p>
                      <p>
                        Input reference: <span className="break-all text-fish-primary">{result.inputRef}</span>
                      </p>
                    </>
                  ) : null}
                </div>
              </details>
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

function DishCard({ dish, activeDishId, onSelect, compact = false }: { dish: FishDish; activeDishId: string; onSelect: (dishId: string) => void; compact?: boolean }) {
  const isActive = dish.id === activeDishId;
  const visual = dishVisuals[dish.id] ?? dishVisuals.ask;
  return (
    <button
      type="button"
      onClick={() => onSelect(dish.id)}
      aria-pressed={isActive}
      disabled={Boolean(dish.disabled)}
      className={`group relative overflow-hidden rounded-[1.35rem] border text-left shadow-harbor transition ${
        compact ? "min-h-32" : "min-h-48"
      } ${
        isActive
          ? "border-fish-accent ring-2 ring-fish-accent/35"
          : dish.disabled
            ? "cursor-not-allowed border-white/10 opacity-65"
            : "border-fish-accent/18 hover:border-fish-accent/55"
      }`}
    >
      <Image src={visual.image} alt="" fill sizes="(min-width: 1024px) 22vw, 50vw" className="object-cover transition duration-300 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-fish-navy950 via-fish-navy950/45 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        {dish.disabled ? <span className="mb-2 inline-flex rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-gold">Later</span> : null}
        <span className={`${compact ? "text-xl" : "text-2xl"} block font-black leading-tight text-white`}>{dish.title}</span>
        <span className="mt-1 block text-sm font-black text-fish-accent">{dish.subtitle}</span>
      </div>
    </button>
  );
}

function ResultContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: Array<{ type: "heading" | "subheading" | "bullet" | "paragraph"; text: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "heading", text: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({ type: "subheading", text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("- ")) {
      blocks.push({ type: "bullet", text: trimmed.slice(2).trim() });
    } else {
      blocks.push({ type: "paragraph", text: trimmed });
    }
  }

  if (!blocks.length) {
    return <p className="text-base font-bold leading-7 text-white">Fish did not return text for this order.</p>;
  }

  return (
    <div className="space-y-3 text-white">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h4 key={`${block.type}-${index}`} className="text-2xl font-black leading-tight text-white">
              {block.text}
            </h4>
          );
        }
        if (block.type === "subheading") {
          return (
            <p key={`${block.type}-${index}`} className="pt-2 text-xs font-black uppercase tracking-[0.12em] text-fish-gold">
              {block.text}
            </p>
          );
        }
        if (block.type === "bullet") {
          return (
            <div key={`${block.type}-${index}`} className="flex gap-3 rounded-2xl border border-fish-accent/10 bg-white/[0.025] p-3 text-sm font-bold leading-6 text-fish-primary">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fish-accent" aria-hidden="true" />
              <p>{block.text}</p>
            </div>
          );
        }
        return (
          <p key={`${block.type}-${index}`} className="text-base font-bold leading-7 text-fish-primary">
            {block.text}
          </p>
        );
      })}
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
