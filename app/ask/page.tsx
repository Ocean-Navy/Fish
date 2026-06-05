import { ArrowLeft, Fish } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FishMealCounter } from "@/components/FishMealCounter";

export const metadata: Metadata = {
  title: "Ask Fish - AI meal counter",
  description: "Pick a Fish AI dish and get a clear result."
};

export default function AskPage() {
  return (
    <main className="min-h-screen px-4 pb-14 pt-24 sm:px-6 lg:px-8">
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
            Market
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Fish meal counter</p>
            <h1 className="text-5xl font-black leading-none text-white sm:text-6xl">Order. Eat.</h1>
          </div>
          <p className="max-w-xl text-lg font-black leading-tight text-fish-primary">Pick a dish, tell Fish what to make, read the result.</p>
        </div>
        <FishMealCounter />
      </section>
    </main>
  );
}
