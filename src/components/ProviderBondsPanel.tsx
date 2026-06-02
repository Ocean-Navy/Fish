import { Anchor, LockKeyhole, PauseCircle, Waves } from "lucide-react";
import { formatCompact, formatDateTime, formatNumber } from "@/lib/format";
import type { ProviderBondSummary } from "@/lib/providerBonds";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "bondedProviders", label: "Bonded boats", icon: LockKeyhole },
  { key: "activeBonds", label: "Active bonds", icon: Anchor },
  { key: "heldOrDisputedBonds", label: "Review", icon: PauseCircle },
  { key: "activeOceanBondedRounded", label: "OCEAN", icon: Waves }
] as const;

export function ProviderBondsPanel({ summary }: { summary: ProviderBondSummary }) {
  const rows = summary.rows.slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">OCEAN bonds</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Bonded dock slots</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">A prototype signal for serious providers. Proof score and health still decide the lane.</p>
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
                <strong className="mt-3 block text-3xl font-black text-white">{card.key === "activeOceanBondedRounded" ? formatCompact(summary.totals[card.key]) : formatNumber(summary.totals[card.key])}</strong>
              </div>
            );
          })}
        </div>

        {rows.length ? (
          <div className="fish-scroll-table mt-5">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-fish-accent">
                <tr>
                  <th className="border-b border-white/10 px-3 py-3">Boat</th>
                  <th className="border-b border-white/10 px-3 py-3">Bond</th>
                  <th className="border-b border-white/10 px-3 py-3">Routing</th>
                  <th className="border-b border-white/10 px-3 py-3">Unlock</th>
                  <th className="border-b border-white/10 px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.bondId} className="text-fish-primary">
                    <td className="border-b border-white/10 px-3 py-3 font-bold">{row.providerLabel}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <span className="font-bold text-white">{row.amountBucket}</span>
                      <span className="mt-1 block text-xs text-fish-secondary">{row.bondState}</span>
                    </td>
                    <td className="border-b border-white/10 px-3 py-3">{row.activeForRouting ? "Can help" : "No boost"}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <span>{row.unlockState}</span>
                      {row.unlockAvailableAt ? <span className="mt-1 block text-xs text-fish-secondary">{formatDateTime(row.unlockAvailableAt)}</span> : null}
                    </td>
                    <td className="border-b border-white/10 px-3 py-3">{formatDateTime(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">No OCEAN bonds recorded yet.</div>
        )}

        {summary.warnings.length ? <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">{summary.warnings[0]}</div> : null}
      </div>
    </section>
  );
}
