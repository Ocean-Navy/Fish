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
    </RolePageShell>
  );
}
