import type { Metadata } from "next";
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
  { label: "Routing", title: "Ocean behind the counter", body: "Fish chooses providers based on availability, price, reliability, and privacy needs." },
  { label: "Credits", title: "Metered from day one", body: "Usage receipts and credit debits need to exist before advanced token flows." },
  { label: "Providers", title: "Proof for every catch", body: "Provider receipts should back dashboards, payouts, and later scorecards." }
];

export default function DocsPage() {
  return (
    <RolePageShell
      eyebrow="API hatch"
      title="Docs are opening."
      subtitle="One key for builders. Receipts now. Ocean providers next."
      image="/assets/generated/fish-role-builder.png"
      imageAlt="Venice market API hatch with Ocean Navy compute tools"
      chips={["API keys", "Model routes", "Usage receipts", "Provider proof"]}
      primaryAction={{ label: "Join builders", href: "/#pilot" }}
      secondaryAction={{ label: "See roadmap", href: "/roadmap" }}
      steps={steps}
      cards={cards}
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Builder placeholder</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <p className="max-w-3xl text-2xl font-black leading-tight text-white">
              The prototype hatch has keys, models, chat, balance, and usage receipts. Provider proof opens after selected Ocean providers run jobs.
            </p>
            <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href="/roadmap">
              See build order
            </Link>
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
