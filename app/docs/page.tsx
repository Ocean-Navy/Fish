import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Docs - API hatch",
  description: "Developer docs placeholder for Fish API keys, model routing, usage receipts, and future provider proof."
};

const steps = [
  { title: "Get a key", body: "Developers should start with one Fish API key." },
  { title: "Pick a model", body: "Fish can route model choices to healthy providers or fallback routes." },
  { title: "Send a job", body: "The API should feel familiar and hide raw compute details." },
  { title: "Keep receipts", body: "Every useful route needs usage, cost, and provider evidence." }
];

const cards = [
  { label: "API", title: "OpenAI-style surface", body: "Target familiar chat completions, model list, and usage response shapes." },
  { label: "Routing", title: "Mock, fallback, Ocean", body: "Start local, optionally call an external compatible backend, then graduate to selected Ocean providers." },
  { label: "Credits", title: "Metered from day one", body: "Usage receipts and credit debits need to exist before advanced token flows." },
  { label: "Providers", title: "Proof for every catch", body: "Provider receipts should back dashboards, payouts, and later scorecards." }
];

const privacyModes = [
  { title: "External", body: "External fallback. The external provider policy applies." },
  { title: "Ocean policy", body: "Selected Ocean provider with reviewed no-log or limited-log policy." },
  { title: "Hardened", body: "Approved runner, redacted logs, and restricted telemetry." },
  { title: "TEE", body: "Attested provider environment, later." },
  { title: "E2EE to TEE", body: "Client-encrypted prompts to a verified enclave, much later." }
];

export default function DocsPage() {
  return (
    <RolePageShell
      eyebrow="API hatch"
      title="Docs are opening."
      subtitle="One key for builders. Receipts now. Ocean providers next."
      image="/assets/generated/fish-role-builder.png"
      imageAlt="Venice market API hatch with Ocean Navy compute tools"
      chips={["API keys", "Model routes", "Usage receipts", "Privacy ladder"]}
      primaryAction={{ label: "Try chat", href: "/chat" }}
      secondaryAction={{ label: "See roadmap", href: "/roadmap" }}
      steps={steps}
      cards={cards}
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Builder placeholder</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <p className="max-w-3xl text-2xl font-black leading-tight text-white">
              The prototype hatch has keys, models, chat, balance, and usage receipts. Chat can stay mock or use a configured external compatible backend until selected Ocean providers run jobs.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href="/roadmap">
                See build order
              </Link>
              <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href={"/routing" as NextRoute}>
                Route compass
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <div className="mb-5 grid gap-4 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Privacy ladder</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-white sm:text-5xl">Honest modes only.</h2>
            </div>
            <p className="text-lg font-bold leading-8 text-fish-secondary">
              Fish stores hashes and usage in receipts. Strong privacy claims only arrive when the actual route supports them.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {privacyModes.map((mode, index) => (
              <article key={mode.title} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-fish-accent text-sm font-black text-fish-navy950">{index + 1}</span>
                <h3 className="mt-4 text-xl font-black text-white">{mode.title}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-fish-secondary">{mode.body}</p>
              </article>
            ))}
          </div>

          <p className="mt-5 rounded-3xl border border-fish-gold/25 bg-fish-gold/10 p-5 text-base font-black leading-7 text-fish-primary">
            V1 should not say cryptographically private. External fallback means the external provider receives the prompt.
          </p>
        </div>
      </section>
    </RolePageShell>
  );
}
