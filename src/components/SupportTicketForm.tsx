"use client";

import { Send } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";

const requestKinds = [
  { value: "billing", label: "Billing" },
  { value: "refund", label: "Refund" },
  { value: "technical", label: "Technical" },
  { value: "privacy", label: "Privacy" },
  { value: "provider", label: "Provider" },
  { value: "other", label: "Other" }
];

export function SupportTicketForm() {
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      contact: String(data.get("contact") ?? ""),
      kind: String(data.get("kind") ?? "other"),
      accountOrPaymentRef: String(data.get("accountOrPaymentRef") ?? ""),
      message: String(data.get("message") ?? ""),
      company: String(data.get("company") ?? "")
    };

    setStatus("Sending...");
    startTransition(async () => {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        setStatus("Please add contact details and a short message.");
        return;
      }

      form.reset();
      setStatus("Ticket sent. We will follow up through your contact.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
      <label className="hidden">
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>

      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Support ticket</p>
        <h2 className="mt-2 text-3xl font-black leading-tight text-white sm:text-5xl">Tell us what happened.</h2>
        <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">Do not paste prompts, outputs, private keys, seed phrases, or API keys.</p>
      </div>

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
        <legend className="text-sm font-black uppercase tracking-[0.12em] text-fish-gold">Request type</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {requestKinds.map((kind) => (
            <label key={kind.value} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-fish-accent/20 bg-white/[0.03] p-4 transition hover:border-fish-accent/50">
              <input name="kind" value={kind.value} type="radio" className="h-5 w-5 accent-fish-accent" defaultChecked={kind.value === "billing"} />
              <span className="font-black text-fish-primary">{kind.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm font-black uppercase tracking-[0.12em] text-fish-gold">
        Payment or account ref
        <input
          name="accountOrPaymentRef"
          placeholder="optional payment id, API key label, or account note"
          className="h-12 rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 text-fish-primary outline-none transition placeholder:text-fish-secondary/60 focus:border-fish-accent"
        />
      </label>

      <label className="grid gap-2 text-sm font-black uppercase tracking-[0.12em] text-fish-gold">
        Message
        <textarea
          name="message"
          required
          placeholder="What should we check?"
          className="min-h-32 rounded-2xl border border-fish-accent/25 bg-fish-navy950/70 px-4 py-3 text-fish-primary outline-none placeholder:text-fish-secondary/60 focus:border-fish-accent"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950 transition hover:translate-y-[-1px] disabled:cursor-wait disabled:opacity-70"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        Send ticket
      </button>
      <p className="min-h-6 text-sm font-bold text-fish-secondary" role="status">
        {status}
      </p>
    </form>
  );
}
