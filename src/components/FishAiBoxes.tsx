"use client";

import {
  Code2,
  FileText,
  Fish,
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

const MODEL_STORAGE_KEY = "fish-boxes-model-v1";
const BOX_STORAGE_KEY = "fish-boxes-active-v1";

type FishModel = {
  id: string;
  owned_by?: string;
  description?: string;
};

type FishBox = {
  id: string;
  title: string;
  status: string;
  routeLabel: string;
  short: string;
  placeholder: string;
  systemPrompt: string;
  userWrapper: (input: string) => string;
  maxTokens: number;
  icon: LucideIcon;
};

type BoxResult = {
  boxTitle: string;
  content: string;
  model: string;
  route?: string;
  costState?: string;
  receiptId?: string;
  creditsSpent?: number;
  creditsRemaining?: number;
  userChargeUsd?: number;
  providerCostUsd?: number;
  totalTokens?: number;
};

const boxes: FishBox[] = [
  {
    id: "ask",
    title: "Ask",
    status: "Ocean demo node",
    routeLabel: "Warm model",
    short: "General questions with a short direct answer.",
    placeholder: "What should Fish do first for pilot users?",
    systemPrompt: "You are Fish Ask. Answer plainly in a helpful, concise way. Avoid hype and label uncertainty.",
    userWrapper: (input) => `Answer this user question in a short, useful way:\n\n${input}`,
    maxTokens: 512,
    icon: MessageSquareText
  },
  {
    id: "code",
    title: "Code",
    status: "Ocean demo node",
    routeLabel: "Warm model",
    short: "Small coding help, review notes, and snippets.",
    placeholder: "Write a TypeScript helper that formats Fish credits.",
    systemPrompt: "You are Fish Code. Give practical coding help with concise explanations and safe assumptions.",
    userWrapper: (input) => `Help with this coding task. Include code only when useful:\n\n${input}`,
    maxTokens: 700,
    icon: Code2
  },
  {
    id: "explain",
    title: "Explain",
    status: "Ocean demo node",
    routeLabel: "Warm model",
    short: "Simple explanations without heavy jargon.",
    placeholder: "Explain warm inference like I am new to AI.",
    systemPrompt: "You are Fish Explain. Explain like a patient product guide. Use simple language and concrete examples.",
    userWrapper: (input) => `Explain this simply, with no marketing claims:\n\n${input}`,
    maxTokens: 520,
    icon: Lightbulb
  },
  {
    id: "summarize",
    title: "Summarize",
    status: "Beta",
    routeLabel: "Text only",
    short: "Turn pasted text into a compact summary.",
    placeholder: "Paste text to summarize for a pilot update.",
    systemPrompt: "You are Fish Summarize. Extract the main points, risks, and next step. Do not invent facts.",
    userWrapper: (input) => `Summarize this text into bullets and one next step:\n\n${input}`,
    maxTokens: 560,
    icon: FileText
  },
  {
    id: "proposal",
    title: "Proposal Writer",
    status: "Beta",
    routeLabel: "Draft helper",
    short: "Make a short pilot proposal from rough notes.",
    placeholder: "Draft a small proposal for a Fish warm inference demo node.",
    systemPrompt: "You are Fish Proposal Writer. Produce a practical proposal with scope, benefits, limits, and next steps.",
    userWrapper: (input) => `Turn these notes into a short proposal. Keep it honest and implementation-oriented:\n\n${input}`,
    maxTokens: 760,
    icon: PenTool
  },
  {
    id: "ocean",
    title: "Ocean Helper",
    status: "Beta",
    routeLabel: "Ocean context",
    short: "Fish and Ocean wording for non-technical users.",
    placeholder: "How should we describe Ocean-first routing on the site?",
    systemPrompt:
      "You are Fish Ocean Helper. Help explain Fish, Ocean Network, Oncompute, credits, and provider routing. Never claim full decentralization, live payouts, unlimited free AI, or staking yield.",
    userWrapper: (input) => `Answer using Fish/Ocean context and clear caveats where needed:\n\n${input}`,
    maxTokens: 620,
    icon: Waves
  }
];

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

function readStoredBox() {
  if (typeof window === "undefined") {
    return "ask";
  }
  try {
    const stored = window.localStorage.getItem(BOX_STORAGE_KEY);
    return boxes.some((box) => box.id === stored) ? stored ?? "ask" : "ask";
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

export function FishAiBoxes() {
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<FishModel[]>([{ id: "fish-demo-chat", owned_by: "ocean-navy" }]);
  const [selectedModel, setSelectedModel] = useState("fish-demo-chat");
  const [activeBoxId, setActiveBoxId] = useState("ask");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<BoxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeBox = useMemo(() => boxes.find((box) => box.id === activeBoxId) ?? boxes[0], [activeBoxId]);
  const ActiveIcon = activeBox.icon;

  useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedModel(readStoredModel());
      setActiveBoxId(readStoredBox());
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
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
      window.localStorage.setItem(BOX_STORAGE_KEY, activeBoxId);
    } catch {
      // Local storage can be unavailable in strict browser modes.
    }
  }, [activeBoxId, selectedModel]);

  function selectBox(boxId: string) {
    const nextBox = boxes.find((box) => box.id === boxId) ?? boxes[0];
    setActiveBoxId(nextBox.id);
    setError(null);
    setPrompt((current) => current || nextBox.placeholder);
  }

  async function sendPrompt() {
    const key = apiKey.trim();
    const userPrompt = prompt.trim();
    if (!key) {
      setError("Add a Fish API key first.");
      return;
    }
    if (!userPrompt) {
      setError("Add a prompt for this box.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: activeBox.maxTokens,
          messages: [
            {
              role: "system",
              content: `${activeBox.systemPrompt}\n\nFish box: ${activeBox.title}. Public status label: ${activeBox.status}. Route label shown to the user: ${activeBox.routeLabel}.`
            },
            {
              role: "user",
              content: activeBox.userWrapper(userPrompt)
            }
          ]
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      setResult({
        boxTitle: activeBox.title,
        content: payload.choices?.[0]?.message?.content ?? "",
        model: payload.model ?? selectedModel,
        route: payload.fish?.route,
        costState: payload.fish?.costState,
        receiptId: payload.fish?.receiptId,
        creditsSpent: payload.fish?.creditsSpent,
        creditsRemaining: payload.fish?.creditsRemaining,
        userChargeUsd: payload.fish?.userChargeUsd,
        providerCostUsd: payload.fish?.providerCostUsd,
        totalTokens: payload.usage?.total_tokens
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
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Website boxes</p>
              <h2 className="text-3xl font-black text-white">Pick a box.</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {boxes.map((box) => {
              const Icon = box.icon;
              const isActive = box.id === activeBox.id;
              return (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => selectBox(box.id)}
                  aria-pressed={isActive}
                  className={`group min-h-40 rounded-[1.5rem] border p-4 text-left transition ${
                    isActive
                      ? "border-fish-accent bg-fish-accent/10 ring-2 ring-fish-accent/25"
                      : "border-fish-accent/18 bg-white/[0.035] hover:border-fish-accent/55"
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-navy950/70 text-fish-accent ring-1 ring-fish-accent/25">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-gold">
                      {box.status}
                    </span>
                  </span>
                  <span className="mt-4 block text-2xl font-black text-white">{box.title}</span>
                  <span className="mt-2 block text-sm font-bold leading-6 text-fish-secondary">{box.short}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Pilot access</p>
              <h2 className="text-2xl font-black text-white">Credits and route labels</h2>
            </div>
          </div>

          <label className="block text-sm font-black text-fish-primary" htmlFor="fish-box-api-key">
            Fish API key
          </label>
          <input
            id="fish-box-api-key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            autoComplete="off"
            placeholder="fish_sk_..."
            className="mt-2 h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
          />

          <label className="mt-5 block text-sm font-black text-fish-primary" htmlFor="fish-box-model">
            Model
          </label>
          <select
            id="fish-box-model"
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
            <StatusTile label="Box" value={activeBox.status} />
            <StatusTile label="Route" value={result?.route ? formatBadge(result.route) : activeBox.routeLabel} />
            <StatusTile label="Credits" value={result ? `${result.creditsSpent ?? 0} spent` : "Pilot cap"} />
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
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">{activeBox.status}</p>
              <h2 className="text-3xl font-black text-white">{activeBox.title}</h2>
            </div>
          </div>
          <span className="inline-flex h-9 items-center rounded-full border border-fish-accent/25 bg-fish-accent/10 px-3 text-xs font-black uppercase tracking-[0.08em] text-fish-accent">
            {activeBox.routeLabel}
          </span>
        </div>

        <label className="mt-6 block text-sm font-black text-fish-primary" htmlFor="fish-box-prompt">
          Prompt
        </label>
        <textarea
          id="fish-box-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={7}
          placeholder={activeBox.placeholder}
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
            Run box
          </button>
          <button
            type="button"
            onClick={() => {
              setPrompt(activeBox.placeholder);
              setError(null);
            }}
            className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/30 px-5 text-sm font-black text-fish-accent hover:border-fish-accent hover:text-white"
          >
            Use sample
          </button>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
          Pilot keys have caps. Fish shows the route and credits after each answer.
        </div>

        <div className="mt-5 min-h-80 rounded-[1.5rem] border border-fish-accent/18 bg-fish-navy950/45 p-5">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center gap-3 text-sm font-black text-fish-primary">
              <Loader2 className="h-5 w-5 animate-spin text-fish-accent" aria-hidden="true" />
              Fish is answering...
            </div>
          ) : result ? (
            <article>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-fish-accent/15 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-accent">{result.boxTitle}</span>
                <span className="rounded-full border border-fish-accent/20 px-3 py-1 text-xs font-black text-fish-secondary">{result.model}</span>
                {result.route ? <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-xs font-black text-fish-gold">{formatBadge(result.route)}</span> : null}
              </div>
              <p className="whitespace-pre-wrap text-base font-bold leading-7 text-white">{result.content}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric label="Credits spent" value={String(result.creditsSpent ?? 0)} />
                <Metric label="Credits left" value={String(result.creditsRemaining ?? 0)} />
                <Metric label="Tokens" value={String(result.totalTokens ?? 0)} />
                <Metric label="User price" value={`$${(result.userChargeUsd ?? 0).toFixed(4)}`} />
              </div>
              {result.receiptId ? (
                <p className="mt-3 break-all rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-xs font-bold leading-6 text-fish-secondary">
                  Activity id: <span className="text-fish-accent">{result.receiptId}</span>
                </p>
              ) : null}
            </article>
          ) : (
            <div className="grid h-64 place-items-center text-center">
              <div>
                <Fish className="mx-auto h-10 w-10 text-fish-accent" aria-hidden="true" />
                <p className="mx-auto mt-4 max-w-sm text-xl font-black leading-8 text-fish-primary">Choose a box and send a small prompt.</p>
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
