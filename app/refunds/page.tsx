import { Clock, CreditCard, FileCheck2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish Refund Policy - Credit kitchen",
  description: "Plain-language refund policy for Fish prepaid credits, card checkout, USDC checkout, and pilot credits."
};

const steps = [
  { title: "Payment confirms", body: "Fish credits are issued only after card or USDC payment confirms." },
  { title: "Credits are spent", body: "AI dishes spend credits when a request is accepted and routed." },
  { title: "Something goes wrong", body: "Open a support ticket with the payment or account reference." },
  { title: "Fish reviews it", body: "We check payment records, credit entries, and public-safe receipts." }
];

const cards = [
  { label: "Refundable", title: "Unused paid credits", body: "Unused prepaid credits can be reviewed for refund before they are spent." },
  { label: "Refundable", title: "Duplicate payments", body: "Duplicate or mistaken payments can be reviewed when records match." },
  { label: "Not cash", title: "Free pilot credits", body: "Free, grant, testnet, and staking-test credits are not cash refunds." },
  { label: "Network fees", title: "Chain costs stay out", body: "Blockchain gas fees and third-party network costs are normally not refundable by Fish." }
];

const policy = [
  {
    icon: CreditCard,
    title: "Card payments",
    body: "Card refunds are handled through the payment provider after Fish verifies the matching payment and credit state."
  },
  {
    icon: ShieldCheck,
    title: "USDC payments",
    body: "USDC refunds need transaction review. Fish will not ask for private keys or seed phrases."
  },
  {
    icon: Clock,
    title: "Review window",
    body: "For launch, contact Fish as soon as possible. A stricter time window can be added before paid public scale."
  },
  {
    icon: FileCheck2,
    title: "What to include",
    body: "Send contact, payment id or transaction hash, account note, and a short explanation. Do not send prompts or outputs."
  }
];

export default function RefundsPage() {
  return (
    <RolePageShell
      eyebrow="Refund policy"
      title="Credits need clear rules."
      subtitle="Paid credits can be reviewed. Free test credits are not cash."
      image="/assets/generated/fish-flow-use.png"
      imageAlt="Fish meal counter preparing AI dish receipts"
      chips={["Paid credits", "Duplicate payments", "USDC", "No secrets"]}
      primaryAction={{ label: "Ask support", href: "/support" as NextRoute }}
      secondaryAction={{ label: "Open account", href: "/account" }}
      steps={steps}
      cards={cards}
      note="This is the launch policy for prepaid Fish Credits. It is intentionally conservative until paid checkout, support operations, and legal review are complete."
    >
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Plain rules</p>
            <h2 className="mt-2 text-4xl font-black leading-tight text-white sm:text-6xl">What can be reviewed?</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {policy.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fish-accent/15 text-fish-accent">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-2xl font-black leading-tight text-white">{item.title}</h3>
                  <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{item.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
