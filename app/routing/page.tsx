import { Anchor, BadgeCheck, Compass, Fish, LockKeyhole, Route as RouteIcon, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { RolePageShell } from "@/components/RolePageShell";
import { getFishRoutePolicy, type RouteModeState } from "@/lib/routePolicy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fish Routing - Route compass",
  description: "Public Fish routing policy for mock chat, external fallback, selected Ocean providers, privacy stages, and receipts."
};

const steps = [
  { title: "Ask Fish", body: "User sends one normal chat/API request." },
  { title: "Pick route", body: "Fish chooses mock, fallback, or selected Ocean provider." },
  { title: "Keep receipt", body: "The tab records usage numbers and proof state." },
  { title: "Show truth", body: "The UI says what really happened." }
];

const stateStyles: Record<RouteModeState, string> = {
  active: "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
  ready: "border-fish-accent/35 bg-fish-accent/15 text-fish-accent",
  "needs-config": "border-fish-gold/35 bg-fish-gold/15 text-fish-gold",
  pilot: "border-fish-aqua/35 bg-fish-aqua/15 text-fish-aqua",
  future: "border-white/20 bg-white/[0.05] text-fish-secondary"
};

const modeIcons = {
  mock: Fish,
  "external-fallback": RouteIcon,
  "selected-ocean-provider": Anchor,
  "ocean-private": ShieldCheck,
  "hardened-runner": LockKeyhole,
  "tee-runner": BadgeCheck
};

export default function RoutingPage() {
  const policy = getFishRoutePolicy();

  return (
    <RolePageShell
      eyebrow="Route compass"
      title="Where does the catch go?"
      subtitle={`${policy.activeRoute.label}. ${policy.activeRoute.isRealAi ? "Real AI today." : "Toy catch today."}`}
      image="/assets/generated/fish-role-builder.png"
      imageAlt="Fish route compass in a Venice Ocean Navy workshop"
      chips={["Mock", "Fallback", "Ocean dock", "Private later"]}
      primaryAction={{ label: "Try chat", href: "/chat" }}
      secondaryAction={{ label: "Open API board", href: "/api" }}
      steps={steps}
      note="Routing rule: if it did not run on a selected Ocean provider, Fish will not call it Ocean provider work."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-fish-accent/15 text-fish-accent">
              <Compass className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Active route</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-6xl">{policy.activeRoute.label}</h2>
            <p className="mt-5 text-lg font-bold leading-8 text-fish-secondary">{policy.activeRoute.privacy}</p>
            <div className="mt-6 rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">Proof tag</p>
              <p className="mt-2 text-xl font-black text-fish-primary">{policy.activeRoute.evidence}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {policy.modes.map((mode) => {
              const Icon = modeIcons[mode.id];
              return (
                <article key={mode.id} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${stateStyles[mode.state]}`}>{mode.state.replace("-", " ")}</span>
                  </div>
                  <h3 className="mt-5 text-2xl font-black text-white">{mode.title}</h3>
                  <p className="mt-2 text-base font-black text-fish-primary">{mode.short}</p>
                  <div className="mt-4 grid gap-2 text-sm font-bold leading-6 text-fish-secondary">
                    <p>{mode.privacy}</p>
                    <p>{mode.proof}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Harbor rules</p>
              <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Simple promises.</h2>
            </div>
            <Link className="inline-flex h-11 items-center justify-center rounded-full border border-fish-accent/40 px-5 text-sm font-black text-fish-accent" href={"/api/routing/policy" as Route}>
              JSON policy
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {policy.rules.map((rule) => (
              <article key={rule.title} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <h3 className="text-xl font-black text-white">{rule.title}</h3>
                <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{rule.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-3xl border border-fish-gold/25 bg-fish-gold/10 p-5 text-lg font-black leading-8 text-fish-primary">
            Next: {policy.nextMilestone}
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
