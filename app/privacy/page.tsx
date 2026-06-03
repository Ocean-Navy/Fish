import { DatabaseZap, EyeOff, FileClock, LockKeyhole, Route, ShieldCheck, Ticket, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Data Policy - Kitchen rules",
  description: "Plain-language Fish data handling rules for AI orders, proof tickets, providers, and future privacy modes."
};

const steps = [
  { title: "You place an order", body: "Your text or file reference is used to prepare the dish." },
  { title: "Fish shows the route", body: "The page tells you which kitchen handled it." },
  { title: "Proof gets a ticket", body: "Public proof uses ids, hashes, usage, costs, and route labels." },
  { title: "Raw data stays off proof", body: "Raw inputs and outputs do not belong in public receipts." }
];

const cards = [
  { label: "Stored", title: "Tickets, not recipes", body: "Fish stores receipt ids, hashes, route labels, credits, usage, and cost fields." },
  { label: "Not public", title: "No raw order text", body: "Public proof, dashboards, receipts, and exports must not show raw prompts, files, or outputs." },
  { label: "Visible", title: "Route labels", body: "Fish should show whether an order used demo mode, outside AI, Ocean batch, or a selected provider." },
  { label: "Future", title: "Stronger kitchens", body: "Hardened runners, TEE, and E2EE are later modes. Fish should not claim them before they exist." }
];

const rules = [
  {
    icon: EyeOff,
    title: "Public proof is hash-only",
    body: "The proof page can show that work happened without showing the raw order or answer."
  },
  {
    icon: Route,
    title: "The route matters",
    body: "If an outside provider or selected provider receives an order, Fish must label that route plainly."
  },
  {
    icon: FileClock,
    title: "Uploads should expire",
    body: "When file uploads are added, the default should be short retention: delete input files after the job or within 24 hours."
  },
  {
    icon: Trash2,
    title: "Users need deletion",
    body: "Account features should include a way to delete stored outputs and private job data."
  }
];

const storageRows = [
  {
    item: "Text orders",
    current: "Processed for the request. Not stored in public proof or usage receipts.",
    target: "Keep out of logs and delete transient processing data after the request."
  },
  {
    item: "Uploaded files",
    current: "No public file upload vault yet.",
    target: "Private storage only, signed job links, delete after job completion or within 24 hours."
  },
  {
    item: "Outputs",
    current: "Returned to the user. Public proof stores no output text.",
    target: "User-only history with a short retention window and manual delete."
  },
  {
    item: "Proof tickets",
    current: "Stored as ids, hashes, route labels, status, tokens, cost, and source state.",
    target: "Keep public-safe for long-term proof without raw order data."
  },
  {
    item: "Signup forms",
    current: "Stored locally for pilot follow-up and admin export.",
    target: "Keep separate from AI orders and remove when no longer needed."
  }
];

const modes = [
  {
    label: "Demo",
    state: "V0",
    title: "Local demo",
    body: "Demo answers stay in the local app process. Useful for shape, not real private AI."
  },
  {
    label: "Outside",
    state: "When enabled",
    title: "Outside AI",
    body: "An outside provider may receive the raw order. Their policy applies."
  },
  {
    label: "Batch",
    state: "Pilot",
    title: "Batch kitchen",
    body: "Fish proof uses hash-only tickets. A private adapter may still need the input reference to run the job."
  },
  {
    label: "Ocean",
    state: "Provider review",
    title: "Selected provider",
    body: "Provider must pass policy, logging, support, and proof checks before handling user workloads."
  },
  {
    label: "Hardened",
    state: "Later",
    title: "Restricted runner",
    body: "Approved containers, redacted logs, limited telemetry, and stronger operator controls."
  },
  {
    label: "Sealed",
    state: "Later",
    title: "TEE / E2EE",
    body: "Hardware attestation and client encryption are future modes. Fish should not claim them today."
  }
];

export default function PrivacyPage() {
  return (
    <RolePageShell
      eyebrow="Data policy"
      title="Your order stays off the public menu."
      subtitle="Fish uses your input to prepare the dish. Proof shows tickets and hashes, not raw data."
      image="/assets/generated/fish-dish-menu-market.webp"
      imageAlt="Fish Venice market counter with AI dishes"
      chips={["No public raw text", "Hash-only proof", "Route labels", "Short retention"]}
      primaryAction={{ label: "Order a dish", href: "/ask" as NextRoute }}
      secondaryAction={{ label: "See proof", href: "/proof" as NextRoute }}
      steps={steps}
      cards={cards}
      note="Plain rule: Fish can only claim the privacy mode that the actual route supports. TEE and end-to-end encryption are future modes, not V0 claims."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Kitchen rules</p>
              <h2 className="mt-2 text-4xl font-black leading-tight text-white sm:text-6xl">Simple and honest.</h2>
            </div>
            <p className="max-w-xl text-base font-bold leading-7 text-fish-secondary">
              Fish should be clear before every stronger privacy claim: who processes the order, what is stored, and what appears in public proof.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {rules.map((rule) => {
              const Icon = rule.icon;
              return (
                <article key={rule.title} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-2xl font-black leading-tight text-white">{rule.title}</h3>
                  <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{rule.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent text-fish-navy950">
              <DatabaseZap className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Storage map</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-white">What Fish keeps.</h2>
            <p className="mt-4 text-base font-bold leading-7 text-fish-secondary">
              The useful long-term record is the ticket: hashes, route, usage, credits, cost, and source state. Raw order data should be transient and private.
            </p>
          </div>

          <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
            <div className="grid gap-3">
              {storageRows.map((row) => (
                <article key={row.item} className="grid gap-3 rounded-[1.25rem] border border-fish-accent/15 bg-white/[0.035] p-4 md:grid-cols-[0.35fr_0.65fr]">
                  <h3 className="text-lg font-black text-white">{row.item}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <p className="text-sm font-bold leading-6 text-fish-secondary">
                      <span className="block text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Now</span>
                      {row.current}
                    </p>
                    <p className="text-sm font-bold leading-6 text-fish-secondary">
                      <span className="block text-xs font-black uppercase tracking-[0.1em] text-fish-accent">Target</span>
                      {row.target}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Privacy modes</p>
              <h2 className="text-4xl font-black leading-tight text-white sm:text-5xl">Label the route. Do not overclaim.</h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modes.map((mode) => (
              <article key={mode.title} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full border border-fish-accent/25 bg-fish-accent/10 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-accent">
                    {mode.label}
                  </span>
                  <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-gold">
                    {mode.state}
                  </span>
                </div>
                <h3 className="mt-5 text-2xl font-black leading-tight text-white">{mode.title}</h3>
                <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{mode.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-gold/15 text-fish-gold">
                  <Ticket className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Public proof</p>
                  <h3 className="text-2xl font-black text-white">Proof should prove work, not reveal data.</h3>
                </div>
              </div>
              <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent hover:border-fish-accent hover:text-white" href={"/routing" as NextRoute}>
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                Route compass
              </Link>
            </div>
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
