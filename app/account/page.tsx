import type { Metadata } from "next";
import { FishAccountPanel } from "@/components/FishAccountPanel";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Account - Credit tab",
  description: "Check Fish Credits, usage receipts, and route cost fields with a prototype Fish API key."
};

const steps = [
  { title: "Paste key", body: "Use a prototype Fish API key." },
  { title: "Read credits", body: "See granted, spent, and remaining credits." },
  { title: "Check receipts", body: "Review routes, hashes, costs, and timestamps." },
  { title: "Keep building", body: "Use the same key in chat or API tests." }
];

const cards = [
  { label: "Balance", title: "Credits left", body: "The account tab reads `/v1/balance` using your Fish key." },
  { label: "Usage", title: "Receipt net", body: "The latest receipts come from `/v1/usage` and stay prompt-free." },
  { label: "Costs", title: "Route money", body: "User charge, provider cost, and margin fields stay visible." },
  { label: "Local", title: "No key storage", body: "The page does not persist the API key in browser storage." }
];

export default function AccountPage() {
  return (
    <RolePageShell
      eyebrow="Credit tab"
      title="Count your FISH."
      subtitle="Paste a key. See credits. Keep the receipts."
      image="/assets/generated/fish-flow-catch.png"
      imageAlt="Glowing Fish credits caught in a Venice market net"
      chips={["Balance", "Receipts", "Costs", "Hashes"]}
      primaryAction={{ label: "Try chat", href: "/chat" }}
      secondaryAction={{ label: "API status", href: "/api" }}
      steps={steps}
      cards={cards}
      note="Account rule: the key is only used to call Fish balance and usage endpoints. Receipt rows show hashes and metrics, not prompt text."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FishAccountPanel />
        </div>
      </section>
    </RolePageShell>
  );
}
