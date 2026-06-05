import type { Metadata } from "next";
import { FishMealCounter } from "@/components/FishMealCounter";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Ask Fish - AI meal counter",
  description: "Pick a Fish AI dish and get a clear result."
};

const steps = [
  { title: "Pick a dish", body: "Choose the outcome you want." },
  { title: "Send it in", body: "Tell Fish what to make." },
  { title: "Get served", body: "Read the answer first." },
  { title: "Keep receipt", body: "Proof stays available when you need it." }
];

const cards = [
  { label: "Docs", title: "Docs Bento", body: "Summarize long notes." },
  { label: "Repo", title: "Repo Roll", body: "Map codebase risks." },
  { label: "Eval", title: "Eval Platter", body: "Score prompt tests." },
  { label: "Data", title: "Data Sushi", body: "Prepare searchable data." }
];

export default function AskPage() {
  return (
    <RolePageShell
      eyebrow="Fish market"
      title="Order from Fish."
      subtitle="Pick a dish. Fish prepares the answer. The receipt stays out of the way."
      image="/assets/generated/fish-dish-menu-market.webp"
      imageAlt="Fish Venice market dolphin chef preparing AI dishes"
      chips={["Docs Bento", "Repo Roll", "Eval Platter", "Data Sushi", "Quick Catch"]}
      primaryAction={{ label: "Open account", href: "/account" }}
      secondaryAction={{ label: "Route compass", href: "/routing" }}
      steps={steps}
      cards={cards}
      note="Your result comes first. Receipts and proof stay available without showing the raw order or answer."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishMealCounter />
        </div>
      </section>
    </RolePageShell>
  );
}
