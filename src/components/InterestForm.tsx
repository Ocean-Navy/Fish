"use client";

import { Send } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";

const roles = [
  { value: "user", label: "Use AI" },
  { value: "developer", label: "Build with API" },
  { value: "provider", label: "Provide compute" },
  { value: "oceanHolder", label: "Hold OCEAN" }
];

type FormStatus = { kind: "idle" | "sending" | "success" | "error"; message: string };

export function InterestForm() {
  const [status, setStatus] = useState<FormStatus>({ kind: "idle", message: "" });
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const subscriberRoles = data.getAll("subscriberRoles").map(String);
    const payload = {
      contact: String(data.get("contact") ?? ""),
      subscriberRoles,
      useCase: String(data.get("useCase") ?? ""),
      expectedUsage: String(data.get("expectedUsage") ?? ""),
      nodeEndpoint: String(data.get("nodeEndpoint") ?? ""),
      healthEndpoint: String(data.get("healthEndpoint") ?? ""),
      gpuType: String(data.get("gpuType") ?? ""),
      region: String(data.get("region") ?? ""),
      priceHint: String(data.get("priceHint") ?? ""),
      payoutPreference: String(data.get("payoutPreference") ?? ""),
      supportContact: String(data.get("supportContact") ?? ""),
      approvedContainer: String(data.get("approvedContainer") ?? ""),
      noLoggingPolicy: data.get("noLoggingPolicy") === "on",
      notes: String(data.get("notes") ?? ""),
      company: String(data.get("company") ?? "")
    };

    setStatus({ kind: "sending", message: "Sending..." });
    startTransition(async () => {
      const endpoint = subscriberRoles.includes("provider") ? "/api/providers/apply" : "/api/waitlist";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          form.reset();
          setStatus({ kind: "success", message: "You are on the list. We will reach out on the contact you gave." });
          return;
        }
        if (response.status === 400) {
          setStatus({ kind: "error", message: "Please add a contact and pick at least one role, then send again." });
          return;
        }
        if (response.status === 429) {
          setStatus({ kind: "error", message: "Too many submissions right now. Wait a minute and try again." });
          return;
        }
        setStatus({ kind: "error", message: "The harbor didn't take the form this time. Try again in a moment." });
      } catch {
        setStatus({ kind: "error", message: "Couldn't reach the server — check your connection and try again. Your text is still in the form." });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <label className="hidden">
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="grid gap-2 text-sm font-black uppercase tracking-[0.12em] text-fish-gold">
        Contact
        <input
          name="contact"
          required
          placeholder="email, Telegram, Discord, or X"
          className="h-12 rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-fish-primary outline-none transition placeholder:text-fish-secondary/60 focus:border-fish-accent"
        />
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-black uppercase tracking-[0.12em] text-fish-gold">I want to</legend>
        <div className="grid grid-cols-2 gap-3">
          {roles.map((role) => (
            <label key={role.value} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-fish-accent/20 bg-white/[0.03] p-4 transition hover:border-fish-accent/50">
              <input name="subscriberRoles" value={role.value} type="checkbox" className="h-5 w-5 accent-fish-accent" />
              <span className="font-black text-fish-primary">{role.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm font-black uppercase tracking-[0.12em] text-fish-gold">
        Notes
        <textarea
          name="notes"
          placeholder="What do you want from Fish?"
          className="min-h-28 rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 py-3 text-base font-bold normal-case tracking-normal text-fish-primary outline-none placeholder:text-fish-secondary/60 focus:border-fish-accent"
        />
      </label>

      <details className="rounded-2xl border border-fish-accent/15 bg-white/[0.03] p-4 text-sm text-fish-secondary">
        <summary className="cursor-pointer font-black text-fish-accent">Provider details</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="nodeEndpoint" aria-label="Node endpoint" placeholder="Node endpoint" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="healthEndpoint" aria-label="Runner health URL" placeholder="Runner health URL" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="gpuType" aria-label="GPU type" placeholder="GPU type" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="region" aria-label="Region" placeholder="Region" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="priceHint" aria-label="Price hint" placeholder="Price hint" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="payoutPreference" aria-label="Payout wallet or preference" placeholder="Payout wallet or preference" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="supportContact" aria-label="Ops contact" placeholder="Ops contact" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="approvedContainer" aria-label="Runner or container image" placeholder="Runner/container image" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent md:col-span-2" />
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-fish-accent/20 bg-white/[0.03] px-3 text-sm font-black text-fish-primary md:col-span-2">
            <input name="noLoggingPolicy" type="checkbox" className="h-5 w-5 accent-fish-accent" />
            I can run with no prompt or output logging for Fish jobs
          </label>
        </div>
      </details>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 transition hover:translate-y-[-1px] disabled:cursor-wait disabled:opacity-70"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        Send interest
      </button>
      {status.kind === "error" ? (
        <p className="min-h-6 rounded-2xl border border-fish-coral/35 bg-fish-coral/10 p-3 text-sm font-black text-fish-primary" role="alert">
          {status.message}
        </p>
      ) : (
        <p className={`min-h-6 text-sm font-bold ${status.kind === "success" ? "text-emerald-200" : "text-fish-secondary"}`} role="status">
          {status.message}
        </p>
      )}
    </form>
  );
}
