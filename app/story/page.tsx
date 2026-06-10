import { ArrowLeft, BadgeDollarSign, Fish, LockKeyhole, Sparkles, Waves } from "lucide-react";
import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketEntrances } from "@/components/MarketEntrances";
import { VisualExplainers } from "@/components/VisualExplainers";

export const metadata: Metadata = {
  title: "The Fish story - Who brings what",
  description: "The full Fish market story: the four doors, the five-step flow, and the labeled maps of how money and compute move."
};

const flow = [
  { title: "Stake OCEAN", image: "/assets/generated/fish-flow-stake.webp", icon: LockKeyhole },
  { title: "Catch FISH", image: "/assets/generated/fish-flow-catch.webp", icon: Fish },
  { title: "Use AI", image: "/assets/generated/fish-flow-use.webp", icon: Sparkles },
  { title: "Providers get paid from usage", image: "/assets/generated/fish-flow-paid.webp", icon: BadgeDollarSign },
  { title: "Ocean grows", image: "/assets/generated/fish-flow-grow.webp", icon: Waves }
];

export default function StoryPage() {
  return (
    <main id="main-content" className="min-h-screen overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-fish-accent/20 bg-fish-navy950/75 px-3 pl-4 backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3" aria-label="Fish home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-fish-accent/35 bg-fish-accent/15 text-fish-accent">
              <Fish className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-black text-white">Fish</span>
          </Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-full border border-fish-accent/35 bg-fish-navy950/60 px-4 text-sm font-black text-white" href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        </div>
      </header>

      <section className="px-4 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">The full story</p>
          <h1 className="mt-3 max-w-3xl text-5xl font-black leading-none text-white sm:text-7xl">One market. Four doors. Everyone eats well.</h1>
          <p className="mt-5 max-w-2xl text-2xl font-black leading-tight text-fish-primary">
            The quick version lives on the front page. This is the whole harbor: who brings what, how money moves, where OCEAN fits — and why every step leaves a receipt.
          </p>
        </div>
      </section>

      <MarketEntrances />

      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">The five-step flow</p>
            <h2 className="mt-2 text-4xl font-black text-white sm:text-6xl">The Fish flow</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {flow.map((item, index) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="group relative min-h-72 overflow-hidden rounded-3xl border border-fish-accent/35 bg-fish-surface shadow-harbor">
                  <Image src={item.image} alt="" fill sizes="(min-width: 768px) 20vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-fish-navy950 via-fish-navy950/15 to-transparent" aria-hidden="true" />
                  <div className="relative flex h-full min-h-72 flex-col justify-between p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-fish-accent text-sm font-black text-fish-navy950">{index + 1}</span>
                    <div>
                      <Icon className="mb-3 h-7 w-7 text-fish-aqua" aria-hidden="true" />
                      <h3 className="text-2xl font-black leading-tight text-white">{item.title}</h3>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <VisualExplainers />

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 text-center shadow-harbor sm:p-10">
          <h2 className="text-3xl font-black text-white sm:text-5xl">Hungry now?</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg font-bold leading-8 text-fish-secondary">The counter is open. No account needed for a taste.</p>
          <Link className="mt-6 inline-flex h-12 items-center rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-8 text-sm font-black text-fish-navy950" href={"/ask" as NextRoute}>
            Ask Fish
          </Link>
        </div>
      </section>

      <footer className="border-t border-fish-accent/15 px-4 py-8 text-sm font-bold text-fish-secondary sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>Built by Ocean Navy on Ocean Protocol. Not official unless approved.</p>
          <div className="flex flex-wrap gap-4 text-fish-gold">
            <Link href={"/privacy" as NextRoute}>Data policy</Link>
            <Link href={"/support" as NextRoute}>Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
