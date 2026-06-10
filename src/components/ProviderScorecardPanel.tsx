import { BadgeDollarSign, CheckCircle2, Fish, LockKeyhole, ReceiptText, ShipWheel } from "lucide-react";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ProviderScorecardRow, ProviderScorecardSignal, ProviderScorecardSummary } from "@/lib/providerScorecard";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "providers", label: "Boats", icon: ShipWheel },
  { key: "readyProviders", label: "Ready", icon: CheckCircle2 },
  { key: "bondedProviders", label: "Bonds", icon: LockKeyhole },
  { key: "jobsRouted", label: "Runs", icon: Fish },
  { key: "verifiedReceipts", label: "Stamps", icon: ReceiptText }
] as const;

const signalStyles: Record<ProviderScorecardSignal, string> = {
  ready: "border-fish-success/35 bg-fish-success/15 text-fish-success",
  proving: "border-fish-accent/35 bg-fish-accent/15 text-fish-accent",
  needs_run: "border-fish-gold/35 bg-fish-gold/15 text-fish-gold",
  review: "border-fish-purple/35 bg-fish-purple/15 text-[#c9bdff]",
  attention: "border-fish-coral/35 bg-fish-coral/15 text-fish-coral"
};

const signalLabels: Record<ProviderScorecardSignal, string> = {
  ready: "Ready",
  proving: "Proving",
  needs_run: "First run",
  review: "Review",
  attention: "Check"
};

export function ProviderScorecardPanel({ summary }: { summary: ProviderScorecardSummary }) {
  const rows = summary.rows.slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Fish market</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Provider scorecard</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">Selected boats, proof stamps, and payout chests. Public labels only.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={summary.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Updated {formatDateTime(summary.lastUpdated)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-fish-secondary">{card.label}</p>
                  <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
                </div>
                <strong className="mt-3 block text-3xl font-black text-white">{formatNumber(summary.totals[card.key])}</strong>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ChestMetric label="Open chest" value={summary.totals.outstandingUsd} />
          <ChestMetric label="Paid out" value={summary.totals.paidUsd} />
        </div>

        {rows.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {rows.map((row) => (
              <ProviderCard key={row.providerId} row={row} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">No boats on the market board yet.</div>
        )}

        {summary.warnings.length ? (
          <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">{summary.warnings.join(" ")}</div>
        ) : null}
      </div>
    </section>
  );
}

function ProviderCard({ row }: { row: ProviderScorecardRow }) {
  const filledPips = Math.round(row.score / 20);

  return (
    <article className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="break-words text-xl font-black text-white">{row.providerLabel}</p>
          <p className="mt-1 text-sm font-bold text-fish-secondary">{row.region}</p>
        </div>
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-1" style={{ background: `conic-gradient(rgba(34, 240, 210, 0.95) ${row.score * 3.6}deg, rgba(255, 255, 255, 0.1) 0deg)` }}>
          <div className="grid h-full w-full place-items-center rounded-full bg-fish-navy950 text-lg font-black text-white">{row.score}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${signalStyles[row.signal]}`}>{signalLabels[row.signal]}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{row.scoreLabel}</span>
      </div>

      <div className="mt-4 flex gap-1" aria-label={`Provider score ${row.score} out of 100`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className={`h-2 flex-1 rounded-full ${index < filledPips ? "bg-fish-aqua" : "bg-white/10"}`} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniMetric label="Runs" value={row.jobsRouted ? `${formatNumber(row.successfulJobs)}/${formatNumber(row.jobsRouted)}` : "0"} />
        <MiniMetric label="Bench" value={row.benchmarkPassRate === null ? "-" : `${formatNumber(row.benchmarkPassRate * 100)}%`} />
        <MiniMetric label="Bond" value={row.bondActiveForRouting ? row.bondAmountBucket : row.bondState === "none" ? "None" : row.bondState} />
        <MiniMetric label="Chest" value={formatUsd(row.outstandingUsd + row.paidUsd)} />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1" aria-label="Provider score inputs">
        <ScoreInput label="Rel" value={row.scoreInputs.reliability} />
        <ScoreInput label="Perf" value={row.scoreInputs.performance} />
        <ScoreInput label="Cost" value={row.scoreInputs.costConfidence} />
        <ScoreInput label="Ops" value={row.scoreInputs.operatorReadiness} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {row.marketBadges.map((badge) => (
          <span key={badge} className="rounded-full border border-fish-accent/15 bg-white/[0.035] px-3 py-1 text-xs font-black text-fish-primary">
            {badge}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm font-bold text-fish-secondary">
        <span>{row.gpuTypes.length ? row.gpuTypes.slice(0, 2).join(", ") : "GPU route pending"}</span>
        <span>{row.maxDailySpendUsd === null ? "Pilot limit pending" : `Pilot limit ${formatUsd(row.maxDailySpendUsd)}/day`}</span>
        <span>Bond tier {formatNumber(row.bondRouteTier)}. {row.bondBoostEligible ? "Boost can apply." : row.bondBoostBlockedReason ?? "No bond boost."}</span>
        <span>State {row.displayState}. Benchmark {row.latestBenchmarkStatus}.</span>
        <span>Last move {formatDateTime(row.latestActivityAt)}</span>
      </div>
    </article>
  );
}

function ChestMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-fish-gold/20 bg-fish-gold/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">{label}</p>
        <BadgeDollarSign className="h-5 w-5 text-fish-gold" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black text-white">{formatUsd(value)}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  );
}

function ScoreInput({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-2 py-2 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{formatNumber(value)}</p>
    </div>
  );
}
