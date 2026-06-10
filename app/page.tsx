import {
  Anchor,
  ArrowRight,
  BadgeDollarSign,
  Fish,
  Route,
  Sparkles
} from "lucide-react";
import Image from "next/image";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { DishShowcase } from "@/components/DishShowcase";
import { HeroAskInput } from "@/components/HeroAskInput";
import { InterestForm } from "@/components/InterestForm";
import { MobileNavMenu } from "@/components/MobileNavMenu";
import { MoreMenu } from "@/components/MoreMenu";

const flow = [
  { title: "Ask Fish", body: "Type a question. Quick Catch answers, no account needed for a taste.", image: "/assets/generated/fish-flow-use.webp", icon: Sparkles },
  { title: "Use credits", body: "Bigger dishes run on Fish credits — free taste, stake OCEAN, or top up.", image: "/assets/generated/fish-flow-stake.webp", icon: Fish },
  { title: "Providers get paid from usage", body: "Real usage settles to GPU providers. Every step keeps a receipt.", image: "/assets/generated/fish-flow-paid.webp", icon: BadgeDollarSign }
];

export default function Home() {
  return (
    <main id="main-content" className="overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-fish-accent/20 bg-fish-navy950/70 px-3 pl-4 backdrop-blur-xl">
          <a href="#top" className="flex items-center gap-3" aria-label="Fish home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-fish-accent/35 bg-fish-accent/15 text-fish-accent">
              <Fish className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-black text-white">Fish</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-black text-fish-secondary md:flex" aria-label="Primary navigation">
            <Link className="hover:text-white" href={"/ask" as NextRoute}>Ask Fish</Link>
            <Link className="hover:text-white" href={"/credits" as NextRoute}>Credits</Link>
            <Link className="hover:text-white" href={"/proof" as NextRoute}>Proof</Link>
            <MoreMenu
              links={[
                { href: "/story", label: "The Fish story" },
                { href: "/dashboard", label: "Dashboard" },
                { href: "/providers", label: "Providers" },
                { href: "/docs", label: "API docs" },
                { href: "/roadmap", label: "Roadmap" },
                { href: "/support", label: "Support" },
                { href: "/privacy", label: "Data policy" }
              ]}
            />
          </nav>
          <div className="flex items-center gap-2">
            <a className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-4 text-sm font-black text-fish-navy950" href="#pilot">
              Join
            </a>
            <MobileNavMenu
              links={[
                { href: "/ask", label: "Ask Fish" },
                { href: "/credits", label: "Credits" },
                { href: "/proof", label: "Proof" },
                { href: "/story", label: "The Fish story" },
                { href: "/dashboard", label: "Dashboard" },
                { href: "/support", label: "Support" },
                { href: "/privacy", label: "Data policy" }
              ]}
            />
          </div>
        </div>
      </header>

      <section id="top" className="relative min-h-screen px-4 pt-28 sm:px-6 lg:px-8">
        <div className="absolute inset-0 fish-home-hero-bg" aria-hidden="true" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,10,30,0.98)_0%,rgba(2,10,30,0.86)_38%,rgba(2,10,30,0.22)_100%)]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-fish-navy950 to-transparent" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-[calc(100vh-7rem)] max-w-7xl items-center">
          <div className="max-w-3xl pb-16">
            <p className="mb-5 inline-flex rounded-full border border-fish-gold/35 bg-fish-gold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-fish-gold">
              Ocean Navy
            </p>
            <h1 className="text-7xl font-black leading-none text-white sm:text-8xl lg:text-[11rem]">Fish</h1>
            <p className="mt-6 text-4xl font-black leading-tight text-fish-primary sm:text-6xl">
              Pick an AI dish. Fish serves it.
            </p>
            <HeroAskInput />
            <div className="mt-5 flex flex-wrap gap-3 text-base font-black text-white">
              {["Quick answers", "Docs", "Code", "Data", "Private by design"].map((item) => (
                <span key={item} className="rounded-full border border-fish-accent/25 bg-fish-navy950/55 px-4 py-2">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <a className="inline-flex h-12 items-center gap-2 rounded-full border border-fish-accent/40 bg-fish-navy950/60 px-6 text-sm font-black text-white" href="#market">
                See the menu <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <DishShowcase />

      <section id="flow" className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">How it works</p>
              <h2 className="mt-2 text-4xl font-black text-white sm:text-6xl">Three steps. Every step receipted.</h2>
            </div>
            <Link className="text-xl font-black text-fish-accent hover:text-white" href={"/story" as NextRoute}>
              Want the full story? →
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {flow.map((item, index) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="group relative min-h-72 overflow-hidden rounded-3xl border border-fish-accent/35 bg-fish-surface shadow-harbor">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 20vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-fish-navy950 via-fish-navy950/15 to-transparent" aria-hidden="true" />
                  <div className="relative flex h-full min-h-72 flex-col justify-between p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-fish-accent text-sm font-black text-fish-navy950">{index + 1}</span>
                    <div>
                      <Icon className="mb-3 h-7 w-7 text-fish-aqua" aria-hidden="true" />
                      <h3 className="text-2xl font-black leading-tight text-white">{item.title}</h3>
                      <p className="mt-2 text-sm font-bold leading-6 text-fish-primary">{item.body}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-fish-accent/25 bg-fish-surface shadow-harbor">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-6 sm:p-10">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Want details?</p>
              <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-6xl">See what is live.</h2>
              <p className="mt-5 max-w-xl text-xl font-bold leading-8 text-fish-secondary">
                Start with the simple proof page. Open the dashboard when you want the full numbers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950" href={"/proof" as NextRoute}>
                  Open proof <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link className="inline-flex h-12 items-center gap-2 rounded-full border border-fish-accent/40 px-6 text-sm font-black text-fish-accent" href={"/routing" as NextRoute}>
                  Route compass
                </Link>
              </div>
            </div>
            <div className="relative min-h-80">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: "url('/assets/visual-identity/fish-ocean-protocol-captain.webp')",
                  backgroundPosition: "center",
                  backgroundSize: "cover"
                }}
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-fish-surface via-transparent to-transparent" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section id="pilot" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="sticky top-24">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">First crew</p>
            <h2 className="mt-3 text-5xl font-black leading-tight text-white sm:text-7xl">Get on board.</h2>
            <div className="mt-7 grid gap-3 text-2xl font-black text-white">
              <div className="flex items-center gap-3"><Anchor className="h-7 w-7 text-fish-accent" aria-hidden="true" /> Users</div>
              <div className="flex items-center gap-3"><Route className="h-7 w-7 text-fish-accent" aria-hidden="true" /> Developers</div>
              <div className="flex items-center gap-3"><BadgeDollarSign className="h-7 w-7 text-fish-accent" aria-hidden="true" /> Providers</div>
            </div>
          </div>
          <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
            <InterestForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-fish-accent/15 px-4 py-8 text-sm font-bold text-fish-secondary sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>Built by Ocean Navy on Ocean Protocol. Not official unless approved.</p>
          <div className="flex flex-wrap gap-4 text-fish-gold">
            <Link href={"/privacy" as NextRoute}>Data policy</Link>
            <Link href={"/support" as NextRoute}>Support</Link>
            <Link href={"/refunds" as NextRoute}>Refunds</Link>
            <p>Product first. Token later.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
