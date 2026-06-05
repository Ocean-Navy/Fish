"use client";

import { Fish, KeyRound, Loader2, MessageSquareText, Send, Trash2, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const LEGACY_THREAD_STORAGE_KEY = "fish-chat-thread-v1";
const LEGACY_REMEMBER_STORAGE_KEY = "fish-chat-remember-v1";
const THREAD_STORAGE_KEY = "fish-chat-thread-v2";
const MODEL_STORAGE_KEY = "fish-chat-model-v1";
const REMEMBER_STORAGE_KEY = "fish-chat-remember-v2";
const THREAD_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

type FishModel = {
  id: string;
  owned_by?: string;
  description?: string;
};

type StoredThread = {
  expiresAt: number;
  messages: ChatBubble[];
};

type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
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
};

function getErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    return error?.message ?? "request_failed";
  }
  return "request_failed";
}

function readStoredRememberThread() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const storedRemember = window.localStorage.getItem(REMEMBER_STORAGE_KEY);
    return storedRemember === "true";
  } catch {
    return false;
  }
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

function removeStoredThread() {
  try {
    window.localStorage.removeItem(THREAD_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_THREAD_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_REMEMBER_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in strict browser modes.
  }
}

function readStoredThread() {
  if (typeof window === "undefined" || !readStoredRememberThread()) {
    return [];
  }
  try {
    const storedThread = window.localStorage.getItem(THREAD_STORAGE_KEY);
    if (!storedThread) {
      return [];
    }
    const parsed = JSON.parse(storedThread) as Partial<StoredThread>;
    if (!Array.isArray(parsed.messages) || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      removeStoredThread();
      return [];
    }
    return parsed.messages.slice(-20);
  } catch {
    removeStoredThread();
    return [];
  }
}

export function FishChatPrototype() {
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<FishModel[]>([{ id: "fish-demo-chat", owned_by: "ocean-navy" }]);
  const [selectedModel, setSelectedModel] = useState(readStoredModel);
  const [prompt, setPrompt] = useState("Explain Fish in one simple line.");
  const [thread, setThread] = useState<ChatBubble[]>(readStoredThread);
  const [rememberThread, setRememberThread] = useState(readStoredRememberThread);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestReceipt = useMemo(() => [...thread].reverse().find((message) => message.role === "assistant" && message.receiptId), [thread]);

  useEffect(() => {
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
      window.localStorage.removeItem(LEGACY_THREAD_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_REMEMBER_STORAGE_KEY);
      window.localStorage.setItem(REMEMBER_STORAGE_KEY, String(rememberThread));
      window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
      if (rememberThread) {
        const storedThread: StoredThread = {
          expiresAt: Date.now() + THREAD_STORAGE_TTL_MS,
          messages: thread.slice(-20)
        };
        window.localStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(storedThread));
      } else {
        removeStoredThread();
      }
    } catch {
      // Local storage can be unavailable in strict browser modes.
    }
  }, [rememberThread, selectedModel, thread]);

  async function sendMessage() {
    const key = apiKey.trim();
    const content = prompt.trim();
    if (!key || !content) {
      setError("Add an API key and a message.");
      return;
    }

    const userMessage: ChatBubble = {
      id: newId(),
      role: "user",
      content,
      model: selectedModel
    };
    const nextThread = [...thread, userMessage].slice(-12);

    setIsLoading(true);
    setError(null);
    setThread(nextThread);
    setPrompt("");

    try {
      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: nextThread.slice(-6).map((message) => ({ role: message.role, content: message.content }))
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      const assistantMessage: ChatBubble = {
        id: newId(),
        role: "assistant",
        content: payload.choices?.[0]?.message?.content ?? "",
        model: payload.model ?? selectedModel,
        route: payload.fish?.route,
        requestedRoute: payload.fish?.requestedRoute,
        fallbackFrom: payload.fish?.fallbackFrom,
        fallbackReason: payload.fish?.fallbackReason,
        costState: payload.fish?.costState,
        receiptId: payload.fish?.receiptId,
        creditsSpent: payload.fish?.creditsSpent ?? 0,
        creditsRemaining: payload.fish?.creditsRemaining ?? 0,
        userChargeUsd: payload.fish?.userChargeUsd,
        providerCostUsd: payload.fish?.providerCostUsd
      };

      setThread((current) => [...current, assistantMessage].slice(-20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setIsLoading(false);
    }
  }

  function clearThread() {
    setThread([]);
    setError(null);
    try {
      removeStoredThread();
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Pilot key</p>
            <h2 className="text-2xl font-black text-white">Unlock the counter</h2>
          </div>
        </div>

        <label className="block text-sm font-black text-fish-primary" htmlFor="fish-api-key">
          Fish API key
        </label>
        <input
          id="fish-api-key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          type="password"
          autoComplete="off"
          placeholder="fish_sk_..."
          className="mt-2 h-12 w-full rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
        />

        <label className="mt-5 block text-sm font-black text-fish-primary" htmlFor="fish-model">
          Model
        </label>
        <select
          id="fish-model"
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

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <RouteBadge icon={Waves} label="Route" value={latestReceipt?.route ? formatBadge(latestReceipt.route) : "Demo"} />
          <RouteBadge icon={Fish} label="Mode" value={latestReceipt?.costState ? formatBadge(latestReceipt.costState) : "Estimate"} />
        </div>

        <label className="mt-5 flex items-center gap-3 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-black text-fish-primary" htmlFor="fish-remember">
          <input
            id="fish-remember"
            type="checkbox"
            checked={rememberThread}
            onChange={(event) => setRememberThread(event.target.checked)}
            className="h-5 w-5 accent-fish-accent"
          />
          Remember this chat on this browser for 24 hours
        </label>
        <p className="mt-2 text-xs font-bold leading-5 text-fish-secondary">
          Off by default. If enabled, this browser stores the visible thread temporarily; never use it on a shared device.
        </p>

        <label className="mt-5 block text-sm font-black text-fish-primary" htmlFor="fish-chat-prompt">
          Ask Fish
        </label>
        <textarea
          id="fish-chat-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          className="mt-2 w-full resize-none rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 p-4 text-sm font-bold leading-6 text-white outline-none transition placeholder:text-fish-muted focus:border-fish-accent"
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={sendMessage}
            disabled={isLoading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Send
          </button>
          <button
            type="button"
            onClick={clearThread}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-fish-accent/30 px-5 text-sm font-black text-fish-accent hover:border-fish-accent hover:text-white"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Chat counter</p>
              <h2 className="text-2xl font-black text-white">Market thread</h2>
            </div>
          </div>
          <span className="rounded-full border border-fish-accent/20 bg-fish-accent/10 px-3 py-1 text-xs font-black text-fish-accent">
            {thread.length} lines
          </span>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black text-fish-primary" role="alert">
            {error}
          </div>
        ) : null}

        {thread.length ? (
          <div className="space-y-3">
            {thread.map((message) => (
              <article key={message.id} className={`rounded-3xl border p-5 ${message.role === "user" ? "border-fish-accent/25 bg-fish-accent/10" : "border-white/10 bg-white/[0.035]"}`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-fish-navy950/70 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-primary">{message.role === "user" ? "You" : "Fish"}</span>
                  {message.model ? <span className="rounded-full border border-fish-accent/20 px-3 py-1 text-xs font-black text-fish-secondary">{message.model}</span> : null}
                  {message.route ? <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-xs font-black text-fish-gold">{formatBadge(message.route)}</span> : null}
                </div>
                <p className="whitespace-pre-wrap text-base font-bold leading-7 text-white">{message.content}</p>
                {message.fallbackFrom ? (
                  <p className="mt-3 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-black leading-6 text-fish-primary">
                    Route changed: {formatBadge(message.fallbackFrom)} to {formatBadge(message.route ?? "")}
                    {message.fallbackReason ? ` (${formatBadge(message.fallbackReason)})` : ""}.
                  </p>
                ) : null}
                {message.receiptId ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Metric label="Spent" value={String(message.creditsSpent ?? 0)} />
                    <Metric label="Left" value={String(message.creditsRemaining ?? 0)} />
                    <Metric label="Price" value={`$${(message.userChargeUsd ?? 0).toFixed(4)}`} />
                    <Metric label="Provider cost" value={`$${(message.providerCostUsd ?? 0).toFixed(4)}`} />
                    <p className="break-all rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4 text-xs font-bold leading-6 text-fish-secondary sm:col-span-2">
                      Activity id: <span className="text-fish-accent">{message.receiptId}</span>
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
            {isLoading ? (
              <div className="flex items-center gap-3 rounded-3xl border border-fish-accent/20 bg-white/[0.035] p-5 text-sm font-black text-fish-primary">
                <Loader2 className="h-4 w-4 animate-spin text-fish-accent" aria-hidden="true" />
                Fish is answering...
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-8 text-center">
            <p className="max-w-sm text-xl font-black leading-8 text-fish-primary">Paste a pilot key and ask a small question.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteBadge({ icon: Icon, label, value }: { icon: typeof Waves; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
        <Icon className="h-4 w-4 text-fish-accent" aria-hidden="true" />
      </div>
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

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
