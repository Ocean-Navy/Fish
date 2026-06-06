import { CircleDollarSign, LockKeyhole, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { RolePageShell } from "@/components/RolePageShell";
import { SupportTicketForm } from "@/components/SupportTicketForm";

export const metadata: Metadata = {
  title: "Fish Support - Help counter",
  description: "Fish support for billing, refunds, account questions, privacy questions, and provider pilot issues."
};

const steps = [
  { title: "Send ticket", body: "Add contact and a short issue summary." },
  { title: "Keep secrets out", body: "Never paste keys, seed phrases, prompts, or outputs." },
  { title: "We check records", body: "Fish can inspect payment ids, credit entries, and public-safe receipts." },
  { title: "You get a reply", body: "We follow up through the contact you gave us." }
];

const cards = [
  { label: "Billing", title: "Payment help", body: "Use this for card, USDC, credit balance, or checkout questions." },
  { label: "Refunds", title: "Request review", body: "Send a payment id and what went wrong. The refund policy explains the rules." },
  { label: "Privacy", title: "Data questions", body: "Ask what is stored, what is public, and which route processed an order." },
  { label: "Providers", title: "Pilot ops", body: "Provider crews can use this for runner, proof, payout, or onboarding issues." }
];

const lanes = [
  {
    icon: CircleDollarSign,
    title: "Paid credits",
    body: "Credits are issued only after payment confirms. Failed or duplicate payments should be reviewed before credits are touched."
  },
  {
    icon: ReceiptText,
    title: "Public-safe records",
    body: "Support can use ids, hashes, route labels, cost fields, and credit entries. Raw prompts and answers stay out of public proof."
  },
  {
    icon: LockKeyhole,
    title: "No secret sharing",
    body: "Fish support will never ask for wallet seed phrases, private keys, API keys, or full payment card details."
  }
];

export default function SupportPage() {
  return (
    <RolePageShell
      eyebrow="Help counter"
      title="Need a hand?"
      subtitle="Billing, refunds, credits, privacy, and provider pilot help."
      image="/assets/generated/fish-dish-menu-market.webp"
      imageAlt="Venice Fish meal counter with Ocean Navy support desk"
      chips={["Billing", "Refunds", "Privacy", "Providers"]}
      primaryAction={{ label: "Open account", href: "/account" }}
      secondaryAction={{ label: "Refund policy", href: "/refunds" as NextRoute }}
      steps={steps}
      cards={cards}
      note="Support tickets are private operator records. Public proof still shows tickets and hashes, not raw prompts or outputs."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            {lanes.map((lane) => {
              const Icon = lane.icon;
              return (
                <article key={lane.title} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h2 className="mt-5 text-2xl font-black text-white">{lane.title}</h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{lane.body}</p>
                </article>
              );
            })}
            <Link className="inline-flex h-12 items-center justify-center rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href={"/privacy" as NextRoute}>
              Read data policy
            </Link>
          </div>
          <SupportTicketForm />
        </div>
      </section>
    </RolePageShell>
  );
}
