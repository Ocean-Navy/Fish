import type { Metadata } from "next";
import { FishMealCounter } from "@/components/FishMealCounter";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Ask Fish - AI meal counter",
  description: "Try Fish dishes for quick answers and Ocean batch proof tickets."
};

const steps = [
  { title: "Pick a dish", body: "Choose a quick taste or an Ocean batch dish." },
  { title: "Bring a key", body: "Use the Fish key from your pilot invite." },
  { title: "Place order", body: "Fish prepares it behind the counter." },
  { title: "Read the ticket", body: "Fish shows route, credits, and proof state." }
];

const cards = [
  { label: "Menu", title: "Many dishes", body: "One backend route can feel like several useful tools." },
  { label: "Credits", title: "Plain spend", body: "Each answer shows credits used, credits left, and an activity id." },
  { label: "Private key", title: "No key saved", body: "The page does not store your Fish API key." },
  { label: "Next", title: "More routes", body: "Selected Ocean provider routes come after pilot testing." }
];

export default function ChatPage() {
  return (
    <RolePageShell
      eyebrow="AI meal counter"
      title="Order from Fish."
      subtitle="Pick a dish. Fish prepares it. The ticket lands on your table."
      image="/assets/generated/fish-dish-menu-market.webp"
      imageAlt="Venice market AI counter with Fish Ocean Navy styling"
      chips={["Docs Bento", "Repo Roll", "Eval Platter", "Data Sushi", "Quick Catch"]}
      primaryAction={{ label: "Read API docs", href: "/docs" }}
      secondaryAction={{ label: "Check account", href: "/account" }}
      steps={steps}
      cards={cards}
      note="Fish labels demo, beta, and outside routes plainly. Selected Ocean provider answers come after provider testing."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishMealCounter />
        </div>
      </section>
    </RolePageShell>
  );
}
