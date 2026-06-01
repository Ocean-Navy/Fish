import type { Metadata } from "next";
import { FishMealCounter } from "@/components/FishMealCounter";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Ask Fish - AI meal counter",
  description: "Order a Fish AI dish and send a prompt through the prototype Fish API."
};

const steps = [
  { title: "Pick a dish", body: "Each dish is a simple task on the Fish menu." },
  { title: "Use one key", body: "Pilot API keys spend Fish credits." },
  { title: "Place order", body: "Fish calls the same API contract." },
  { title: "Read the tab", body: "The answer shows route and credit feedback." }
];

const cards = [
  { label: "Ask", title: "Quick Catch", body: "Simple answers for first questions and product checks." },
  { label: "Code", title: "Code Roll", body: "Small coding help, review notes, and snippets." },
  { label: "Docs", title: "Docs Bento", body: "Summarize pasted notes or docs without file storage." },
  { label: "Images", title: "Image Catch", body: "Coming later as a paid beta before Ocean-native image routes." }
];

export default function AskPage() {
  return (
    <RolePageShell
      eyebrow="Warm inference"
      title="Order from Fish."
      subtitle="Ask, code, summarize docs, and see how each order was served."
      image="/assets/visual-identity/fish-venice-market-dolphin.png"
      imageAlt="Fish Venice market dolphin AI meal counter"
      chips={["Ask", "Code", "Docs", "Images soon", "One API key"]}
      primaryAction={{ label: "Open account", href: "/account" }}
      secondaryAction={{ label: "Route compass", href: "/routing" }}
      steps={steps}
      cards={cards}
      note="These dishes use the prototype Fish API. They do not claim unlimited free AI, live provider payouts, or full decentralization."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishMealCounter />
        </div>
      </section>
    </RolePageShell>
  );
}
