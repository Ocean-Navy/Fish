import type { Metadata } from "next";
import { FishMealCounter } from "@/components/FishMealCounter";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Ask Fish - AI meal counter",
  description: "Pick a Fish AI dish, send it to the kitchen, and see the proof ticket."
};

const steps = [
  { title: "Pick a dish", body: "Choose the outcome you want." },
  { title: "Send it in", body: "Fish prepares it behind the counter." },
  { title: "Get served", body: "Your answer comes back with a ticket." },
  { title: "Check proof", body: "Batch dishes keep raw text off public proof." }
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
      subtitle="Pick a dish. Fish prepares it. The ticket lands on your table."
      image="/assets/generated/fish-dish-menu-market.webp"
      imageAlt="Fish Venice market dolphin chef preparing AI dishes"
      chips={["Docs Bento", "Repo Roll", "Eval Platter", "Data Sushi", "Quick Catch"]}
      primaryAction={{ label: "Open account", href: "/account" }}
      secondaryAction={{ label: "Route compass", href: "/routing" }}
      steps={steps}
      cards={cards}
      note="Batch dishes use proof tickets. Sample tickets are clearly labeled until a private Ocean batch kitchen is configured."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishMealCounter />
        </div>
      </section>
    </RolePageShell>
  );
}
