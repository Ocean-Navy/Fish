"use client";

import { KeyRound, Loader2, MessageSquareText, Send } from "lucide-react";
import { useState } from "react";

type ChatResult = {
  content: string;
  receiptId: string;
  creditsSpent: number;
  creditsRemaining: number;
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

export function FishChatPrototype() {
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("Explain Fish in one simple line.");
  const [result, setResult] = useState<ChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage() {
    const key = apiKey.trim();
    const content = prompt.trim();
    if (!key || !content) {
      setError("Add an API key and a message.");
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
          model: "fish-demo-chat",
          messages: [{ role: "user", content }]
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(payload));
      }

      setResult({
        content: payload.choices?.[0]?.message?.content ?? "",
        receiptId: payload.fish?.receiptId ?? "",
        creditsSpent: payload.fish?.creditsSpent ?? 0,
        creditsRemaining: payload.fish?.creditsRemaining ?? 0,
        userChargeUsd: payload.fish?.userChargeUsd,
        providerCostUsd: payload.fish?.providerCostUsd
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
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

        <button
          type="button"
          onClick={sendMessage}
          disabled={isLoading}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          Send test catch
        </button>
      </div>

      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
            <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Receipt counter</p>
            <h2 className="text-2xl font-black text-white">Prototype answer</h2>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-4 text-sm font-black text-fish-primary" role="alert">
            {error}
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-lg font-bold leading-8 text-white">{result.content}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Credits spent" value={String(result.creditsSpent)} />
              <Metric label="Credits left" value={String(result.creditsRemaining)} />
              <Metric label="User charge" value={`$${(result.userChargeUsd ?? 0).toFixed(4)}`} />
              <Metric label="Provider cost" value={`$${(result.providerCostUsd ?? 0).toFixed(4)}`} />
            </div>
            <p className="break-all rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4 text-xs font-bold leading-6 text-fish-secondary">
              Receipt: <span className="text-fish-accent">{result.receiptId}</span>
            </p>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-8 text-center">
            <p className="max-w-sm text-xl font-black leading-8 text-fish-primary">Paste a pilot key, ask a small question, and Fish writes a receipt.</p>
          </div>
        )}
      </div>
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
