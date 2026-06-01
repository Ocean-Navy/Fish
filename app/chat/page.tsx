import type { Metadata } from "next";
import { FishChatPrototype } from "@/components/FishChatPrototype";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Chat - AI counter",
  description: "Try the Fish chat counter with a pilot key and Fish credits."
};

const steps = [
  { title: "Bring a key", body: "Use the Fish key from your pilot invite." },
  { title: "Pick a model", body: "Choose what Fish should use for the answer." },
  { title: "Ask Fish", body: "Type a question and send it." },
  { title: "See your tab", body: "Fish shows how many credits were used." }
];

const cards = [
  { label: "Now", title: "Simple chat", body: "Ask a question and see the answer in one place." },
  { label: "Credits", title: "Clear spend", body: "Each answer shows the credits used and the credits left." },
  { label: "Private key", title: "No key saved", body: "The page can remember the chat, but it does not store your Fish key." },
  { label: "Next", title: "Ocean providers", body: "Selected Ocean providers come next after pilot testing." }
];

export default function ChatPage() {
  return (
    <RolePageShell
      eyebrow="Chat counter"
      title="Ask Fish."
      subtitle="One small counter for questions, answers, and credits."
      image="/assets/generated/fish-flow-use.png"
      imageAlt="Venice market AI counter with Fish Ocean Navy styling"
      chips={["Pilot key", "Model menu", "Saved chat", "Credits"]}
      primaryAction={{ label: "Read API docs", href: "/docs" }}
      secondaryAction={{ label: "Check account", href: "/account" }}
      steps={steps}
      cards={cards}
      note="Fish will always label how your answer was made. Selected Ocean provider answers come after provider testing."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishChatPrototype />
        </div>
      </section>
    </RolePageShell>
  );
}
