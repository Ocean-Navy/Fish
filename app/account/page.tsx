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

const billingLanes = [
  { title: "Free grant", body: "Starter credits can prove the product loop before checkout exists." },
  { title: "Plan credits", body: "Subscriptions need limits, expiry rules, and provider-payment coverage." },
  { title: "Top-ups", body: "Prepaid balance comes later with refunds, fraud checks, and liability caps." },
  { title: "Hard settlement", body: "Providers still need real settlement funds, not unfunded credit promises." }
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
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Billing later</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">Tabs before checkout.</h2>
              <p className="mt-3 text-lg font-bold leading-8 text-fish-secondary">
                The account tab proves balances and receipts first. Plans and top-ups come after limits, refunds, and provider settlement coverage.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {billingLanes.map((lane) => (
                <article key={lane.title} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                  <h3 className="text-xl font-black text-white">{lane.title}</h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-fish-secondary">{lane.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
