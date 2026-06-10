import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { EndpointBoard } from "@/components/EndpointBoard";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Docs - API hatch",
  description: "Builder notes for Fish API keys, model choices, usage records, and provider proof."
};

const steps = [
  { title: "Get a key", body: "Start with one Fish API key." },
  { title: "Pick a dish", body: "Use a dish model like fish-docs or fish-repo." },
  { title: "Send a request", body: "Use a familiar chat shape." },
  { title: "Check usage", body: "See credits used and route status." }
];

const cards = [
  { label: "API", title: "Dish models", body: "Use fish-ask, fish-code, fish-docs, fish-repo, fish-eval, fish-data, or fish-ocean-helper." },
  { label: "Routing", title: "Clear route labels", body: "Fish says whether an answer came from demo mode, outside AI, or selected Ocean providers." },
  { label: "Data", title: "Tickets, not raw text", body: "Proof stores hashes, route labels, usage, and credits, not raw prompts or outputs." },
  { label: "Providers", title: "Proof for provider work", body: "Provider jobs need public-safe proof before they become normal routes." }
];

const privacyModes = [
  { title: "Outside AI", body: "An outside AI provider may receive the prompt. Their policy applies." },
  { title: "Ocean policy", body: "Selected Ocean provider with reviewed privacy rules." },
  { title: "Stronger runner", body: "More locked-down provider runner, later." },
  { title: "Hardware proof", body: "Hardware-backed privacy, later." },
  { title: "End-to-end private", body: "Encrypted all the way to the runner, much later." }
];

export default function DocsPage() {
  return (
    <RolePageShell
      eyebrow="API hatch"
      title="Build with Fish."
      subtitle="One key. One chat request. Credits and route labels included."
      image="/assets/generated/fish-role-builder.webp"
      imageAlt="Venice market API hatch with Ocean Navy compute tools"
      chips={["API keys", "Models", "Usage", "Privacy"]}
      primaryAction={{ label: "Try chat", href: "/ask" }}
      secondaryAction={{ label: "See roadmap", href: "/roadmap" }}
      steps={steps}
      cards={cards}
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Builder start</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <p className="max-w-3xl text-2xl font-black leading-tight text-white">
              Fish starts with keys, key rotation, models, chat, balance, and usage records. Selected Ocean provider routes come after provider testing.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href="/roadmap">
                See build order
              </Link>
              <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href={"/routing" as NextRoute}>
                Route compass
              </Link>
              <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href={"/privacy" as NextRoute}>
                Data policy
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
              Fish should say the truth about privacy. Stronger privacy labels arrive only when the route really supports them.
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
            For now, do not treat Fish as private encryption. If outside AI is used, that provider receives the prompt. Public proof still keeps raw prompts and outputs out of receipts, dashboards, and exports.
          </p>
        </div>
      </section>
      <EndpointBoard />
    </RolePageShell>
  );
}
