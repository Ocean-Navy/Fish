import type { Metadata } from "next";
import { ProviderPilotPanel } from "@/components/ProviderPilotPanel";
import { RolePageShell } from "@/components/RolePageShell";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fish Provider Pilot - List compute at the dock",
  description: "Join the first Fish provider crew and help route real AI demand to Ocean Network compute."
};

const steps = [
  { title: "Show GPUs", body: "Share your compute details and payout preference." },
  { title: "Run approved jobs", body: "Start with selected workloads and clear rules." },
  { title: "Get proof", body: "Fish tracks usage, reliability, and payout evidence." },
  { title: "Earn trust", body: "Reliable providers can qualify for scorecards and future OCEAN bond utility." }
];

const cards = [
  { label: "Promise", title: "No mystery marketplace", body: "Fish packages demand for users and sends selected jobs to providers behind the scenes." },
  { label: "V0 payout", title: "Real payment first", body: "Provider payment is planned from usage, reserves, or funded budgets." },
  { label: "Scorecard", title: "Reliability matters", body: "Latency, availability, pricing, and successful jobs become visible proof." },
  { label: "Future", title: "Bonded dock slots", body: "OCEAN provider bonds can come later, after jobs and scorecards exist." }
];

export default async function ProvidersPage() {
  const registry = await collectProviderPilotRegistry();

  return (
    <RolePageShell
      eyebrow="Dock master"
      title="Have compute?"
      subtitle="Bring GPUs to the Fish market and catch real AI demand."
      image="/assets/generated/fish-flow-paid.png"
      imageAlt="Ocean Navy provider dock with compute gear and glowing payouts"
      chips={["List compute", "Run jobs", "Get paid", "Build trust"]}
      primaryAction={{ label: "Join provider crew", href: "/#pilot" }}
      secondaryAction={{ label: "View supply", href: "/dashboard" }}
      steps={steps}
      cards={cards}
      note="Provider rule: staking does not pay providers by itself. Fish needs real usage, reserves, or funded budgets for payouts."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <ProviderPilotPanel registry={registry} compact />
        </div>
      </section>
    </RolePageShell>
  );
}
