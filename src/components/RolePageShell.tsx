import { ArrowLeft, ArrowRight, Fish } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type ShellCard = {
  title: string;
  body: string;
  label?: string;
};

type ShellStep = {
  title: string;
  body?: string;
};

type RolePageShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  chips: string[];
  primaryAction?: {
    label: string;
    href: Route;
  };
  secondaryAction?: {
    label: string;
    href: Route;
  };
  cards?: ShellCard[];
  steps?: ShellStep[];
  note?: string;
  children?: ReactNode;
};

export function RolePageShell({
  eyebrow,
  title,
  subtitle,
  image,
  imageAlt,
  chips,
  primaryAction,
  secondaryAction,
  cards = [],
  steps = [],
  note,
  children
}: RolePageShellProps) {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-fish-accent/20 bg-fish-navy950/75 px-3 pl-4 backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3" aria-label="Fish home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-fish-accent/35 bg-fish-accent/15 text-fish-accent">
              <Fish className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-black text-white">Fish</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-black text-fish-secondary md:flex" aria-label="Page navigation">
            <Link className="hover:text-white" href="/#market">
              Market
            </Link>
            <Link className="hover:text-white" href="/dashboard">
              Dashboard
            </Link>
            <Link className="hover:text-white" href="/roadmap">
              Roadmap
            </Link>
          </nav>
          <Link className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-4 text-sm font-black text-fish-navy950" href="/#pilot">
            Join
          </Link>
        </div>
      </header>

      <section className="relative px-4 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
          <div className="order-2 flex min-h-[28rem] flex-col justify-between rounded-[2rem] border border-fish-accent/25 bg-fish-surface/82 p-6 shadow-harbor backdrop-blur sm:p-9 lg:order-1 lg:min-h-[34rem]">
            <div>
              <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-black text-fish-secondary hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to market
              </Link>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">{eyebrow}</p>
              <h1 className="mt-3 text-5xl font-black leading-none text-white sm:text-7xl">{title}</h1>
              <p className="mt-5 max-w-2xl text-2xl font-black leading-tight text-fish-primary sm:text-4xl">{subtitle}</p>
            </div>

            <div>
              <div className="mt-9 flex flex-wrap gap-3">
                {chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-fish-accent/25 bg-fish-navy950/65 px-4 py-2 text-sm font-black text-white">
                    {chip}
                  </span>
                ))}
              </div>
              {(primaryAction || secondaryAction) && (
                <div className="mt-8 flex flex-wrap gap-3">
                  {primaryAction && (
                    <Link className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950" href={primaryAction.href}>
                      {primaryAction.label}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                  {secondaryAction && (
                    <Link className="inline-flex h-12 items-center rounded-full border border-fish-accent/40 bg-fish-navy950/60 px-6 text-sm font-black text-white" href={secondaryAction.href}>
                      {secondaryAction.label}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="order-1 relative min-h-[22rem] overflow-hidden rounded-[2rem] border border-fish-accent/25 bg-fish-surface shadow-harbor sm:min-h-[28rem] lg:order-2 lg:min-h-[34rem]">
            <Image src={image} alt={imageAlt} fill priority sizes="(min-width: 1024px) 48vw, 100vw" className="fish-role-image object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-fish-navy950/85 via-fish-navy950/10 to-transparent" aria-hidden="true" />
          </div>
        </div>
      </section>

      {(steps.length > 0 || cards.length > 0) && (
        <section className="px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            {steps.length > 0 && (
              <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Flow</p>
                <div className="mt-5 grid gap-3">
                  {steps.map((step, index) => (
                    <article key={step.title} className="grid grid-cols-[2.75rem_1fr] gap-4 rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-4">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-fish-accent text-sm font-black text-fish-navy950">{index + 1}</span>
                      <div>
                        <h2 className="text-xl font-black text-white">{step.title}</h2>
                        {step.body && <p className="mt-1 text-sm font-bold leading-6 text-fish-secondary">{step.body}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {cards.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {cards.map((card) => (
                  <article key={card.title} className="min-h-44 rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                    {card.label && <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">{card.label}</p>}
                    <h2 className="mt-2 text-2xl font-black leading-tight text-white">{card.title}</h2>
                    <p className="mt-3 text-base font-bold leading-7 text-fish-secondary">{card.body}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {children}

      {note && (
        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-gold/30 bg-fish-gold/10 p-6 text-xl font-black leading-8 text-fish-primary shadow-harbor sm:p-8">
            {note}
          </div>
        </section>
      )}
    </main>
  );
}
