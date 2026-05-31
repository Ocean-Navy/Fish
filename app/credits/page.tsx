import type { Metadata } from "next";
import { RolePageShell } from "@/components/RolePageShell";
import { StakingCreditsPanel } from "@/components/StakingCreditsPanel";
import { summarizeStakingCredits } from "@/lib/stakingCredits";

export const metadata: Metadata = {
  title: "Fish Credits - OCEAN utility without magic",
  description: "A simple public explainer for future Fish Credits, OCEAN staking utility, provider bonds, and tokenized credits."
};

const steps = [
  { title: "Stake OCEAN", body: "Lock OCEAN into a clear utility lane when the budget exists." },
  { title: "Earn credits", body: "Credits can grant AI access from funded budgets or product margin." },
  { title: "Use AI", body: "Spend credits in the Fish app/API instead of touching raw compute." },
  { title: "Support supply", body: "Later, bonds and capacity pools can help route demand to reliable providers." }
];

const cards = [
  { label: "Holders", title: "Stake. Lock. Utility.", body: "The simple target is OCEAN-backed access to useful AI, not a token promise on day one." },
  { label: "Providers", title: "Bonds can come later", body: "Bonded providers may earn routing eligibility once scorecards and settlement are real." },
  { label: "Credits", title: "FISH is an access idea first", body: "Credits should represent usable AI access before they become transferable assets." },
  { label: "Risk rule", title: "No unfunded payouts", body: "Fish should not create provider liabilities before revenue, reserve, or budget policy exists." }
];

const tokenGuardrails = [
  { title: "Not V0", body: "The first lane is useful AI credits, not a public token launch." },
  { title: "Usage gate", body: "Credits become composable only after real usage and receipts exist." },
  { title: "Coverage gate", body: "Outstanding credits need visible reserves and provider settlement coverage." },
  { title: "Review gate", body: "Legal, audit, pause controls, and risk copy come before transferability." }
];

export default async function CreditsPage() {
  const stakingSummary = await summarizeStakingCredits();

  return (
    <RolePageShell
      eyebrow="Vault door"
      title="Credits people understand."
      subtitle="Lock OCEAN. Catch AI credits. Spend them on useful work."
      image="/assets/generated/fish-flow-stake.png"
      imageAlt="Glowing Ocean-style compute coins in a Venice market vault"
      chips={["OCEAN staking", "AI credits", "Provider bonds", "Token later"]}
      primaryAction={{ label: "Get updates", href: "/#pilot" }}
      secondaryAction={{ label: "Read roadmap", href: "/roadmap" }}
      steps={steps}
      cards={cards}
      note="Credit rule: product first, token utility after usage. Fish Credits should be backed by real demand and settlement work."
    >
      <StakingCreditsPanel summary={stakingSummary} />
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-gold/25 bg-fish-gold/10 p-6 shadow-harbor sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Token later</p>
          <div className="mt-4 grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">No magic coin chest.</h2>
              <p className="mt-3 text-lg font-bold leading-8 text-fish-primary">
                Tokenized credits only make sense after the market proves usage, settlement, reserves, and controls.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {tokenGuardrails.map((guardrail) => (
                <article key={guardrail.title} className="rounded-3xl border border-fish-gold/20 bg-fish-navy950/45 p-5">
                  <h3 className="text-xl font-black text-white">{guardrail.title}</h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-fish-secondary">{guardrail.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
