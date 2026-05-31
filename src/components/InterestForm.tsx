"use client";

import { Send } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";

const roles = [
  { value: "user", label: "User" },
  { value: "developer", label: "Developer" },
  { value: "provider", label: "Provider" },
  { value: "oceanHolder", label: "OCEAN holder" }
];

export function InterestForm() {
  const [status, setStatus] = useState<string>("");
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
      gpuType: String(data.get("gpuType") ?? ""),
      region: String(data.get("region") ?? ""),
      payoutPreference: String(data.get("payoutPreference") ?? ""),
      notes: String(data.get("notes") ?? ""),
      company: String(data.get("company") ?? "")
    };

    setStatus("Sending...");
    startTransition(async () => {
      const endpoint = subscriberRoles.includes("provider") ? "/api/providers/apply" : "/api/waitlist";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        setStatus("Please add a contact and at least one role.");
        return;
      }

      form.reset();
      setStatus("You are on the first crew list.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <label className="hidden">
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="grid gap-2 text-sm font-black uppercase tracking-[0.12em] text-fish-gold">
        Your signal
        <input
          name="contact"
          required
          placeholder="email, Telegram, Discord, or X"
          className="h-12 rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-fish-primary outline-none transition placeholder:text-fish-secondary/60 focus:border-fish-accent"
        />
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-black uppercase tracking-[0.12em] text-fish-gold">I am</legend>
        <div className="grid grid-cols-2 gap-3">
          {roles.map((role) => (
            <label key={role.value} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-fish-accent/20 bg-white/[0.03] p-4 transition hover:border-fish-accent/50">
              <input name="subscriberRoles" value={role.value} type="checkbox" className="h-5 w-5 accent-fish-accent" />
              <span className="font-black text-fish-primary">{role.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <textarea
        name="notes"
        placeholder="What do you want from Fish?"
        className="min-h-28 rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 py-3 text-fish-primary outline-none placeholder:text-fish-secondary/60 focus:border-fish-accent"
      />

      <details className="rounded-2xl border border-fish-accent/15 bg-white/[0.03] p-4 text-sm text-fish-secondary">
        <summary className="cursor-pointer font-black text-fish-accent">Provider details</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="nodeEndpoint" placeholder="Node endpoint" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
          <input name="gpuType" placeholder="GPU / region" className="h-11 rounded-xl border border-fish-accent/25 bg-fish-navy950/70 px-3 text-fish-primary outline-none focus:border-fish-accent" />
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
      <p className="min-h-6 text-sm font-bold text-fish-secondary" role="status">
        {status}
      </p>
    </form>
  );
}
