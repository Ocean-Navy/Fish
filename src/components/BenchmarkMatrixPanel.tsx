import { Activity, Gauge, Grid3X3, TimerReset } from "lucide-react";
import { formatCompact, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { BenchmarkSummary } from "@/lib/providerBenchmarks";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "benchmarkRuns", label: "Runs", icon: Activity },
  { key: "successfulRuns", label: "Passed", icon: Gauge },
  { key: "untestedCells", label: "Untested", icon: Grid3X3 },
  { key: "timedOutRuns", label: "Timed out", icon: TimerReset }
] as const;

export function BenchmarkMatrixPanel({ summary }: { summary: BenchmarkSummary }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Benchmark board</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Provider route tests</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Small repeatable jobs show which selected provider routes have passed, failed, timed out, or still need a first run.
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
          <SmallMetric label="Selected providers" value={formatNumber(summary.totals.selectedProviders)} />
          <SmallMetric label="Pass rate" value={summary.totals.passRate === null ? "-" : `${formatNumber(summary.totals.passRate * 100)}%`} />
          <SmallMetric label="Workloads" value={formatNumber(summary.definitions.length)} />
        </div>

        {summary.matrix.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-fish-accent">
                <tr>
                  <th className="border-b border-white/10 px-3 py-3">Provider</th>
                  <th className="border-b border-white/10 px-3 py-3">Route test</th>
                  <th className="border-b border-white/10 px-3 py-3">Status</th>
                  <th className="border-b border-white/10 px-3 py-3">Samples</th>
                  <th className="border-b border-white/10 px-3 py-3">Runtime</th>
                  <th className="border-b border-white/10 px-3 py-3">Cost</th>
                  <th className="border-b border-white/10 px-3 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {summary.matrix.slice(0, 9).map((row) => (
                  <tr key={`${row.providerId}-${row.benchmarkId}`} className="text-fish-primary">
                    <td className="border-b border-white/10 px-3 py-3 font-bold">{row.providerLabel}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <span className="block font-bold">{row.title}</span>
                      <span className="text-xs text-fish-secondary">{row.inputSizeBucket} to {row.outputSizeBucket}</span>
                    </td>
                    <td className="border-b border-white/10 px-3 py-3">{row.latestStatus}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatNumber(row.sampleSize)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{row.medianRuntimeSeconds === null ? "-" : `${formatNumber(row.medianRuntimeSeconds)}s`}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatUsd(row.providerCostUsd)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{row.receiptSignatureStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">
            Select providers first, then run the tiny smoke benchmark to fill the board.
          </div>
        )}

        {summary.warnings.length ? (
          <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">
            {summary.warnings[0]}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}
