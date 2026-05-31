import { BadgeDollarSign, KeyRound, ReceiptText, Route } from "lucide-react";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { FishUsageSummary as FishUsageSummaryData } from "@/lib/fishLedger";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "accounts", label: "API keys", icon: KeyRound },
  { key: "requests", label: "Requests", icon: ReceiptText },
  { key: "creditsSpent", label: "Credits spent", icon: BadgeDollarSign },
  { key: "mockJobs", label: "Mock jobs", icon: Route }
] as const;

export function FishUsageSummary({ summary }: { summary: FishUsageSummaryData }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Fish API proof</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Usage counter</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Phase 1 tracks keys, requests, credit debits, receipt timing, and estimated cost fields before provider routing goes live.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={summary.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Last receipt {formatDateTime(summary.lastReceiptAt)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-fish-secondary">{card.label}</p>
                  <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
                </div>
                <strong className="mt-3 block text-3xl font-black text-white">{formatNumber(summary[card.key])}</strong>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MoneyCard label="Estimated user charge" value={summary.userChargeUsd} />
          <MoneyCard label="Estimated provider cost" value={summary.providerCostUsd} />
          <MoneyCard label="Estimated gross margin" value={summary.grossMarginUsd} />
        </div>

        {summary.creditLanes.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {summary.creditLanes.slice(0, 3).map((lane) => (
              <div key={lane.lane} className="rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{lane.lane} lane</p>
                <p className="mt-2 text-2xl font-black text-white">{formatNumber(lane.balance)}</p>
                <p className="mt-1 text-xs font-bold text-fish-secondary">
                  {formatNumber(lane.granted)} granted / {formatNumber(lane.spent)} spent
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">
          Ocean-native jobs: {formatNumber(summary.oceanNativeJobs)}. Fallback jobs: {formatNumber(summary.externalFallbackJobs)}. Provider payouts stay at {formatUsd(summary.providerPayoutUsd)} until selected Ocean providers run real jobs.
        </div>
      </div>
    </section>
  );
}

function MoneyCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{formatUsd(value)}</p>
    </div>
  );
}
