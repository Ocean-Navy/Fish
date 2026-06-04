"use client";

import { ArrowRight, Coins, KeyRound, MessageSquareText, ServerCog } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

const entrances = [
  {
    id: "users",
    title: "Users",
    stall: "Meal counter",
    image: "/assets/generated/fish-flow-use.png",
    icon: MessageSquareText,
    cta: "Ask Fish",
    href: "/ask",
    chips: ["Pick a dish", "Use credits", "See route"],
    scene: ["Choose a dish", "Place order", "Read the tab"]
  },
  {
    id: "builders",
    title: "Builders",
    stall: "API hatch",
    image: "/assets/generated/fish-role-builder.png",
    icon: KeyRound,
    cta: "Get a key",
    href: "/api",
    chips: ["One key", "Send requests", "Build faster"],
    scene: ["Choose a model", "Send a request", "Read the result"]
  },
  {
    id: "providers",
    title: "Providers",
    stall: "Fishing boats",
    image: "/assets/generated/fish-flow-paid.png",
    icon: ServerCog,
    cta: "List compute",
    href: "/providers",
    chips: ["Bring GPUs", "Get demand", "Get paid"],
    scene: ["Apply", "Join a crew", "Earn"]
  },
  {
    id: "holders",
    title: "Holders",
    stall: "Vault door",
    image: "/assets/generated/fish-flow-stake.png",
    icon: Coins,
    cta: "Stake OCEAN",
    href: "/credits",
    chips: ["Use OCEAN", "Earn credits", "Grow Ocean"],
    scene: ["Lock OCEAN", "Earn credits", "Use AI"]
  }
];

export function MarketEntrances() {
  const [activeId, setActiveId] = useState(entrances[0].id);
  const active = entrances.find((entrance) => entrance.id === activeId) ?? entrances[0];
  const ActiveIcon = active.icon;

  return (
    <section id="market" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Venice fish market</p>
            <h2 className="mt-2 text-4xl font-black text-white sm:text-6xl">Pick your entrance.</h2>
          </div>
          <p className="max-w-md text-xl font-black text-fish-accent">Same market. Different doors.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
          <div className="grid gap-3 sm:grid-cols-2">
            {entrances.map((entrance) => {
              const Icon = entrance.icon;
              const isActive = entrance.id === active.id;

              return (
                <button
                  key={entrance.id}
                  type="button"
                  onClick={() => setActiveId(entrance.id)}
                  className={`group relative min-h-72 overflow-hidden rounded-[1.5rem] border p-0 text-left shadow-harbor transition ${
                    isActive
                      ? "border-fish-accent bg-fish-accent/10 ring-2 ring-fish-accent/25"
                      : "border-fish-accent/25 bg-fish-surface hover:border-fish-accent/60"
                  }`}
                  aria-pressed={isActive}
                >
                  <Image
                    src={entrance.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 24vw, (min-width: 640px) 45vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-fish-navy950 via-fish-navy950/20 to-transparent" aria-hidden="true" />
                  <span className="relative flex min-h-72 flex-col justify-between p-5">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-fish-navy950/80 text-fish-accent ring-1 ring-fish-accent/35">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-black uppercase tracking-[0.12em] text-fish-gold">{entrance.stall}</span>
                      <span className="mt-1 block text-3xl font-black text-white">{entrance.title}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-fish-accent/25 bg-fish-surface shadow-harbor">
            <Image
              src={active.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover opacity-35"
              priority={false}
            />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(2,10,30,0.96),rgba(2,10,30,0.78)_48%,rgba(18,216,255,0.08))]" aria-hidden="true" />

            <div className="relative grid min-h-[520px] content-between gap-8 p-6 sm:p-8">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-fish-accent text-fish-navy950">
                    <ActiveIcon className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">{active.stall}</p>
                    <h3 className="text-4xl font-black text-white">{active.title} door</h3>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {active.chips.map((chip) => (
                    <span key={chip} className="rounded-2xl border border-fish-accent/25 bg-fish-navy950/65 px-4 py-3 text-sm font-black text-fish-primary">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-fish-accent/25 bg-fish-navy950/70 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {active.scene.map((item, index) => (
                    <div key={item} className="rounded-2xl bg-white/5 p-4">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-fish-accent/15 text-sm font-black text-fish-accent">{index + 1}</span>
                      <p className="mt-4 text-xl font-black text-white">{item}</p>
                    </div>
                  ))}
                </div>
                <a
                  href={active.href}
                  className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-6 text-sm font-black text-fish-navy950"
                >
                  {active.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
