import { Coins, KeyRound, LockKeyhole, Waves } from "lucide-react";
import { formatCompact, formatDateTime, formatNumber } from "@/lib/format";
import type { StakingCreditSummary } from "@/lib/stakingCredits";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "oceanStaked", label: "OCEAN locked", icon: Waves },
  { key: "creditsIssued", label: "Credits issued", icon: Coins },
  { key: "creditsSpent", label: "Credits spent", icon: KeyRound },
  { key: "budgetRemaining", label: "Budget left", icon: LockKeyhole }
] as const;

export function StakingCreditsPanel({ summary }: { summary: StakingCreditSummary }) {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Credit vault</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Stake. Catch credits.</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Pilot records can lock OCEAN intent, issue a Fish API key, and track aggregate credit usage without exposing holder balances or wallet links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={summary.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Updated {formatDateTime(summary.lastUpdated)}</span>
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
                <strong className="mt-3 block text-3xl font-black text-white">{formatCompact(summary.totals[card.key])}</strong>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Small label="Budget policy" value={`${formatNumber(summary.policy.creditsPerOceanMonth)} credits / OCEAN / month`} />
          <Small label="Record state" value={formatChainState(summary.policy.onchainState)} />
          <Small label="Average lock" value={summary.totals.averageLockDays === null ? "-" : `${formatNumber(summary.totals.averageLockDays)} days`} />
        </div>

        {summary.positions.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {summary.positions.slice(0, 6).map((position) => (
              <article key={position.positionId} className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-white">Private stake record</h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{position.creditState}</p>
                  </div>
                  <span className="rounded-full border border-fish-gold/25 bg-fish-gold/10 px-3 py-1 text-xs font-black text-fish-gold">{position.sourceState}</span>
                </div>
                <p className="mt-4 text-sm font-bold leading-6 text-fish-secondary">
                  Public proof keeps holder labels, wallet hashes, lock details, and per-account credit balances private unless an explicit disclosure flow is added.
                </p>
                <p className="mt-4 text-xs font-bold text-fish-secondary">Recorded {formatDateTime(position.createdAt)}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">
            No OCEAN stake records yet. The vault is ready for a funded pilot budget.
          </div>
        )}

        {summary.warnings.length ? <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">{summary.warnings.join(" ")}</div> : null}
      </div>
    </section>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  );
}

function formatChainState(state: string) {
  if (state === "offchain_prototype") {
    // Honesty rule: these are operator-kept off-chain records, not on-chain state.
    return "off-chain records (operator-verified)";
  }
  return state.replaceAll("_", " ");
}
