import type { Metadata } from "next";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Roadmap - Product first, token utility later",
  description: "The public Fish roadmap from Venice-style AI app to Ocean provider routing, usage proof, OCEAN credits, and later tokenized credits."
};

const steps = [
  { title: "Market opens", body: "Landing page, dashboard, pilot forms, and public proof points." },
  { title: "AI counter", body: "One simple app/API with keys, receipts, and metered usage." },
  { title: "Provider dock", body: "Selected Ocean providers run real jobs behind Fish." },
  { title: "Proof board", body: "Supply, demand, reliability, and payouts become visible." },
  { title: "OCEAN credits", body: "Staked OCEAN can earn AI credits from funded budgets." },
  { title: "Provider bonds", body: "Providers can bond OCEAN for routing eligibility." },
  { title: "Venice parity", body: "Useful app, API, privacy, billing, and routing layers." },
  { title: "Tokenized credits", body: "Only later, after usage and settlement are real." }
];

const cards = [
  { label: "Now", title: "Make demand visible", body: "Show the market clearly: who wants AI, who has compute, and where the first route can work." },
  { label: "Next", title: "Ship the AI counter", body: "A boringly useful chat/API surface comes before complex token mechanics." },
  { label: "Then", title: "Pay real providers", body: "Provider payouts come from usage, reserves, or funded budgets, not from staking magic." },
  { label: "Later", title: "Add stronger utility", body: "Credits, bonds, and capacity markets make more sense once the product has traffic." }
];

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
    />
  );
}
