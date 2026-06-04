import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Roadmap - Product first, token utility later",
  description: "The public Fish roadmap from Venice-style AI app to Ocean provider routing, usage proof, OCEAN credits, and later tokenized credits."
};

const steps = [
  { title: "Market opens", body: "Landing page, dashboard, pilot forms, and public proof points." },
  { title: "Meal counter", body: "One simple app/API with keys, usage records, and metered usage." },
  { title: "Provider dock", body: "Selected Ocean providers run real jobs behind Fish." },
  { title: "Proof board", body: "Supply, demand, reliability, and payouts become visible." },
  { title: "OCEAN credits", body: "Staked OCEAN can earn AI credits from funded budgets." },
  { title: "Provider bonds", body: "Providers can bond OCEAN for routing eligibility." },
  { title: "Full loop", body: "Useful app, API, privacy, billing, and routing layers." },
  { title: "Tokenized credits", body: "Only later, after usage and settlement are real." }
];

const cards = [
  { label: "Now", title: "Make demand visible", body: "Show the market clearly: who wants AI, who has compute, and where the first route can work." },
  { label: "Next", title: "Ship the meal counter", body: "A useful chat/API surface comes before complex token mechanics." },
  { label: "Then", title: "Pay real providers", body: "Provider payouts come from usage, reserves, or funded budgets, not from staking magic." },
  { label: "Later", title: "Add stronger utility", body: "Credits, bonds, and capacity markets make more sense once the product has traffic." }
];

const parityGroups = [
  { title: "App + API", state: "Opening", body: "Chat, model menu, API keys, usage dashboard, and credit balance." },
  { title: "Billing", state: "Pilot", body: "Internal credits first, then grants, top-ups, subscriptions, and usage records." },
  { title: "Routing", state: "Pilot", body: "Ocean providers, outside AI, provider preference, and cost-aware backup routes." },
  { title: "Privacy", state: "Staged", body: "Outside AI, private Ocean providers, stronger runners, then hardware privacy much later." },
  { title: "OCEAN staking", state: "Pilot", body: "Funded-budget credits from locked OCEAN, tracked with clear caps." },
  { title: "Credit minting", state: "Later", body: "Lock, mint, spend, burn, and unlock only after settlement is safe." },
  { title: "Provider bonds", state: "Later", body: "Bonds can boost eligibility, but score and reliability cap the boost." },
  { title: "Capacity pool", state: "Later", body: "Unused credits may route demand only after legal and reserve controls." },
  { title: "Tokenized credits", state: "Last", body: "No token launch until usage, reserves, audits, and legal rails exist." }
];

const buildSequence = ["Landing", "API", "Credits", "Providers", "Proof", "Staking", "Bonds", "Pool", "Token", "Privacy"];

export default function RoadmapPage() {
  return (
    <RolePageShell
      eyebrow="Harbor map"
      title="The voyage map."
      subtitle="Build the product first. Add OCEAN utility after real usage."
      image="/assets/generated/fish-flow-grow.png"
      imageAlt="Moonlit Venice harbor growing into a brighter Ocean ecosystem"
      chips={["Public V0", "AI app/API", "Usage proof", "Credits later"]}
      primaryAction={{ label: "Join pilot", href: "/#pilot" }}
      secondaryAction={{ label: "Open dashboard", href: "/dashboard" }}
      steps={steps}
      cards={cards}
      note="Roadmap rule: users buy AI, providers get paid, and OCEAN utility grows only after the loop proves itself."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <div className="mb-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Full product loop</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-white sm:text-5xl">Build the whole loop.</h2>
            </div>
            <p className="text-lg font-bold leading-8 text-fish-secondary">
              Fish should cover the useful product layers: app, API, billing, privacy, routing, credits, staking, provider payments, and proof.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {parityGroups.map((group) => (
              <article key={group.title} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-gold">
                  {group.state}
                </span>
                <h3 className="mt-4 text-2xl font-black text-white">{group.title}</h3>
                <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{group.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-fish-accent/20 bg-fish-navy950/55 p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Build order</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {buildSequence.map((item, index) => (
                <span key={item} className="rounded-full border border-fish-accent/20 bg-fish-accent/10 px-3 py-2 text-xs font-black text-fish-primary">
                  {index + 1}. {item}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex h-12 items-center rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950" href={"/ask" as NextRoute}>
              Ask Fish
            </Link>
            <Link className="inline-flex h-12 items-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href="/credits">
              Credits guardrails
            </Link>
            <Link className="inline-flex h-12 items-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href={"/routing" as NextRoute}>
              Route compass
            </Link>
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
