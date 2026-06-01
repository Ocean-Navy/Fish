import type { Metadata } from "next";
import { FishAccountPanel } from "@/components/FishAccountPanel";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Account - Credit tab",
  description: "Check Fish credits and recent activity with a pilot key."
};

const steps = [
  { title: "Paste key", body: "Use your Fish pilot key." },
  { title: "See credits", body: "Check what came in, what was used, and what is left." },
  { title: "See activity", body: "Review recent AI use without seeing prompt text." },
  { title: "Keep going", body: "Use the same key in chat or API tests." }
];

const cards = [
  { label: "Balance", title: "Credits left", body: "See your current Fish credit balance." },
  { label: "Activity", title: "Recent use", body: "See when credits were used and by which model." },
  { label: "Costs", title: "Simple numbers", body: "Fish shows the basic cost numbers behind each use." },
  { label: "Private key", title: "No key saved", body: "The page does not store your Fish key." }
];

const billingLanes = [
  { title: "Free credits", body: "Starter credits help early users try Fish." },
  { title: "Plans", body: "Monthly plans come after limits and safety checks are ready." },
  { title: "Top-ups", body: "Prepaid credits come later with clear refund rules." },
  { title: "Provider pay", body: "Providers are paid from real funds, not promises." }
];

export default function AccountPage() {
  return (
    <RolePageShell
      eyebrow="Credit tab"
      title="Count your FISH."
      subtitle="Paste a key. See credits. Know what was used."
      image="/assets/generated/fish-flow-catch.png"
      imageAlt="Glowing Fish credits caught in a Venice market net"
      chips={["Balance", "Recent use", "Costs", "No prompts"]}
      primaryAction={{ label: "Try chat", href: "/chat" }}
      secondaryAction={{ label: "API status", href: "/api" }}
      steps={steps}
      cards={cards}
      note="Your key is used only for this check. Fish shows usage numbers, not your prompt text."
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
              <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">Credits first. Checkout later.</h2>
              <p className="mt-3 text-lg font-bold leading-8 text-fish-secondary">
                First we make balances and recent use clear. Paid plans and top-ups come after the rules are ready.
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
