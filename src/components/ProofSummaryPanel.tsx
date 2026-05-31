import { FileCheck2, Gauge, ReceiptText, Ship } from "lucide-react";
import { formatCompact, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ProofSummary } from "@/lib/providerJobs";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "oceanJobsRouted", label: "Ocean jobs", icon: Ship },
  { key: "verifiedReceipts", label: "Receipts", icon: ReceiptText },
  { key: "pilotProviders", label: "Pilot providers", icon: FileCheck2 },
  { key: "failedJobs", label: "Needs review", icon: Gauge }
] as const;

export function ProofSummaryPanel({ summary }: { summary: ProofSummary }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Proof board</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Provider job receipts</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Selected provider smoke jobs create public-safe receipts with hashes, usage, cost, and status. Prompt and output text are not stored here.
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
                <strong className="mt-3 block text-3xl font-black text-white">{formatCompact(summary[card.key])}</strong>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SmallMetric label="Provider payout accrual" value={formatUsd(summary.providerPayoutUsd)} />
          <SmallMetric label="Benchmark pass rate" value={summary.benchmarkPassRate === null ? "-" : `${formatNumber(summary.benchmarkPassRate * 100)}%`} />
          <SmallMetric label="Ocean-native share" value={`${formatNumber(summary.oceanNativeShare * 100)}%`} />
        </div>

        {summary.receipts.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-fish-accent">
                <tr>
                  <th className="border-b border-white/10 px-3 py-3">Receipt</th>
                  <th className="border-b border-white/10 px-3 py-3">Provider</th>
                  <th className="border-b border-white/10 px-3 py-3">Status</th>
                  <th className="border-b border-white/10 px-3 py-3">Usage</th>
                  <th className="border-b border-white/10 px-3 py-3">Cost</th>
                  <th className="border-b border-white/10 px-3 py-3">Hash</th>
                </tr>
              </thead>
              <tbody>
                {summary.receipts.slice(0, 6).map((receipt) => (
                  <tr key={receipt.receiptId} className="text-fish-primary">
                    <td className="border-b border-white/10 px-3 py-3 font-bold">{receipt.receiptId.slice(0, 14)}...</td>
                    <td className="border-b border-white/10 px-3 py-3">{receipt.providerLabel}</td>
                    <td className="border-b border-white/10 px-3 py-3">{receipt.status}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatNumber(receipt.usage.inputTokens + receipt.usage.outputTokens)} tokens</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatUsd(receipt.cost.providerCostUsd)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{receipt.hashes.canonicalReceiptHash.slice(0, 18)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">
            No provider job receipts yet. Select a provider, run a smoke job, and the first receipt appears here.
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
