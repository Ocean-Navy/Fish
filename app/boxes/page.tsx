import type { Metadata } from "next";
import { FishAiBoxes } from "@/components/FishAiBoxes";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Boxes - Warm AI demo",
  description: "Choose a Fish AI box and send a prompt through the prototype Fish API."
};

const steps = [
  { title: "Pick a box", body: "Each box has its own lightweight prompt wrapper." },
  { title: "Use one key", body: "Pilot API keys spend Fish credits." },
  { title: "Run the task", body: "Fish calls the same chat API contract." },
  { title: "See status", body: "The answer shows route and credit feedback." }
];

const cards = [
  { label: "Ask", title: "Simple answers", body: "Good for first questions and quick product checks." },
  { label: "Code", title: "Small dev tasks", body: "Helpful for snippets, review notes, and implementation hints." },
  { label: "Write", title: "Summaries and proposals", body: "Turn rough notes into short, useful drafts." },
  { label: "Ocean", title: "Context helper", body: "Explain Fish and Ocean concepts with careful caveats." }
];

export default function BoxesPage() {
  return (
    <RolePageShell
      eyebrow="Warm inference"
      title="Fish AI boxes."
      subtitle="One demo model, several honest boxes, clear route and credit feedback."
      image="/assets/visual-identity/fish-venice-market-dolphin.png"
      imageAlt="Fish Venice market dolphin AI boxes"
      chips={["Ocean demo node", "Beta boxes", "Pilot credits", "No yield claims"]}
      primaryAction={{ label: "Open account", href: "/account" }}
      secondaryAction={{ label: "Route compass", href: "/routing" }}
      steps={steps}
      cards={cards}
      note="These boxes use the prototype Fish API. They do not claim unlimited free AI, live provider payouts, or full decentralization."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishAiBoxes />
        </div>
      </section>
    </RolePageShell>
  );
}
