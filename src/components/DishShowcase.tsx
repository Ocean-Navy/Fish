import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { FISH_DISHES } from "@/lib/fishDishes";
import { FISH_DISH_VISUALS } from "@/lib/fishDishVisuals";

/**
 * Landing capability section, Venice-style: one card per dish, one CTA each,
 * straight into the meal counter with that dish pre-selected.
 */
export function DishShowcase() {
  const dishes = FISH_DISHES.filter((dish) => dish.enabled).slice(0, 5);
  return (
    <section id="market" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">The menu</p>
            <h2 className="mt-2 text-4xl font-black text-white sm:text-6xl">Pick a dish. Fish serves it.</h2>
          </div>
          <p className="max-w-md text-lg font-black leading-tight text-fish-accent">No account needed for a taste.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {dishes.map((dish) => {
            const visual = FISH_DISH_VISUALS[dish.id] ?? FISH_DISH_VISUALS.ask;
            return (
              <Link
                key={dish.id}
                href={`/ask?dish=${dish.id}` as Route}
                className="group relative min-h-64 overflow-hidden rounded-3xl border border-fish-accent/25 bg-fish-surface shadow-harbor transition hover:border-fish-accent/60"
              >
                <Image src={visual.image} alt="" fill sizes="(min-width: 1024px) 20vw, 50vw" className="object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-fish-navy950 via-fish-navy950/40 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-xl font-black leading-tight text-white">{dish.title}</p>
                  <p className="mt-1 text-sm font-black text-fish-accent">{dish.subtitle}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.08em] text-fish-gold opacity-0 transition group-hover:opacity-100">
                    Order <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
