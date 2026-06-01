import type { Metadata } from "next";
import { FishAiBoxes } from "@/components/FishAiBoxes";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Boxes - AI counters",
  description: "Try Fish AI boxes for ask, code, explain, summarize, proposal writing, and Ocean help."
};

const steps = [
  { title: "Pick a box", body: "Choose Ask, Code, Explain, Summarize, Proposal Writer, or Ocean Helper." },
  { title: "Bring a key", body: "Use the Fish key from your pilot invite." },
  { title: "Send a prompt", body: "Each box wraps the prompt for the same API route." },
  { title: "Read the tab", body: "Fish shows route, credits, and activity id." }
];

const cards = [
  { label: "Now", title: "Many boxes", body: "One backend route can feel like several useful tools." },
  { label: "Credits", title: "Plain spend", body: "Each answer shows credits used, credits left, and an activity id." },
  { label: "Private key", title: "No key saved", body: "The page does not store your Fish API key." },
  { label: "Next", title: "More routes", body: "Selected Ocean provider routes come after pilot testing." }
];

export default function ChatPage() {
  return (
    <RolePageShell
      eyebrow="AI boxes"
      title="Pick a Fish box."
      subtitle="Ask, code, explain, summarize, draft, or get Ocean help from one simple counter."
      image="/assets/generated/fish-flow-use.png"
      imageAlt="Venice market AI counter with Fish Ocean Navy styling"
      chips={["Pilot key", "Box prompts", "Route labels", "Credits"]}
      primaryAction={{ label: "Read API docs", href: "/docs" }}
      secondaryAction={{ label: "Check account", href: "/account" }}
      steps={steps}
      cards={cards}
      note="Fish labels demo, beta, and outside routes plainly. Selected Ocean provider answers come after provider testing."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishAiBoxes />
        </div>
      </section>
    </RolePageShell>
  );
}
