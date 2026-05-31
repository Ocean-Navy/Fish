import type { Metadata } from "next";
import { FishChatPrototype } from "@/components/FishChatPrototype";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Chat - Prototype AI counter",
  description: "A simple Fish chat prototype that uses API keys, spends Fish Credits, and writes usage receipts."
};

const steps = [
  { title: "Bring a pilot key", body: "Admins issue keys from the prototype API." },
  { title: "Ask one question", body: "The chat uses the OpenAI-style Fish endpoint." },
  { title: "Spend credits", body: "Every request debits the local Fish Credits ledger." },
  { title: "Keep the receipt", body: "The response returns a receipt id for usage proof." }
];

const cards = [
  { label: "Now", title: "Mock or fallback", body: "The default response is local. Operators can enable an external compatible backend for real AI calls." },
  { label: "Tracked", title: "Credits and costs", body: "Requests record credits, estimated user charge, provider cost, and margin fields." },
  { label: "Private", title: "No prompt logs in receipts", body: "Receipts store request hashes and usage numbers, not raw prompt text." },
  { label: "Next", title: "Ocean provider route", body: "Selected providers can replace the mock backend once the pilot allowlist is ready." }
];

export default function ChatPage() {
  return (
    <RolePageShell
      eyebrow="Chat counter"
      title="Ask Fish."
      subtitle="One tiny AI counter for keys, credits, and receipts."
      image="/assets/generated/fish-flow-use.png"
      imageAlt="Venice market AI counter with Fish Ocean Navy styling"
      chips={["Pilot key", "Mock/fallback", "Credit debit", "Receipt"]}
      primaryAction={{ label: "Read API docs", href: "/docs" }}
      secondaryAction={{ label: "Open dashboard", href: "/dashboard" }}
      steps={steps}
      cards={cards}
      note="Prototype rule: this chat tests the Fish product loop. External fallback is not Ocean routing; selected Ocean provider proof remains separate."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishChatPrototype />
        </div>
      </section>
    </RolePageShell>
  );
}
