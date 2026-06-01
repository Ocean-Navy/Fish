import { FileCheck2, Gauge, ReceiptText, Ship } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { formatCompact, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ProofSummary, ProviderJobReceipt } from "@/lib/providerJobs";
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
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Provider job proof</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Selected provider test jobs create public-safe proof with signatures, hashes, usage, cost, and status. Prompt and output text are not stored here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={summary.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Updated {formatDateTime(summary.lastUpdated)}</span>
            <Link className="rounded-full border border-fish-accent/35 px-4 py-2 text-xs font-black text-fish-accent" href="/api/proof/receipts?limit=20">
              JSON proof
            </Link>
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

        <div className="mt-4 rounded-3xl border border-fish-gold/20 bg-fish-gold/10 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Payout chest</p>
              <p className="mt-1 text-sm font-bold text-fish-primary">Payable events are linked to signed proof or manual adjustments.</p>
            </div>
            <p className="text-sm font-black text-fish-primary">{formatNumber(summary.payouts.eventCount)} event{summary.payouts.eventCount === 1 ? "" : "s"}</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <PayoutChip label="Accrued" value={summary.payouts.totals.accrued} />
            <PayoutChip label="Review" value={summary.payouts.totals.review} />
            <PayoutChip label="Approved" value={summary.payouts.totals.approved} />
            <PayoutChip label="Paid" value={summary.payouts.totals.paid} />
            <PayoutChip label="Disputed" value={summary.payouts.totals.disputed} />
            <PayoutChip label="Voided" value={summary.payouts.totals.voided} />
          </div>
          {summary.payouts.providerSummaries.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-fish-gold/20 bg-fish-navy950/40 p-4">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Provider tabs</p>
                <div className="mt-3 space-y-2">
                  {summary.payouts.providerSummaries.slice(0, 4).map((provider) => (
                    <div key={provider.providerId} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <div>
                        <p className="font-black text-white">{provider.providerLabel}</p>
                        <p className="text-xs font-bold text-fish-secondary">
                          {provider.receiptLinkedEvents} proof row{provider.receiptLinkedEvents === 1 ? "" : "s"} / {provider.manualAdjustmentEvents} manual
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-fish-primary">{formatUsd(provider.totals.outstandingUsd)}</p>
                        <p className="text-xs font-bold text-fish-secondary">{provider.eventCount} event{provider.eventCount === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-fish-gold/20 bg-fish-navy950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Payable rows</p>
                  <Link className="text-xs font-black text-fish-accent hover:text-white" href="/api/proof/payouts?limit=50">
                    JSON
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {summary.payouts.events.slice(0, 4).map((event) => (
                    <div key={event.payoutEventId} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <div>
                        <p className="font-black text-white">{event.providerLabel}</p>
                        <p className="text-xs font-bold text-fish-secondary">
                          {formatReceiptType(event.eventType)} / {formatReceiptType(event.state)} / {event.sourceKind === "receipt" && event.sourceReceiptId ? (
                            <Link className="text-fish-accent hover:text-white" href={`/api/proof/receipts/${event.sourceReceiptId}` as Route}>
                              proof
                            </Link>
                          ) : (
                            "manual"
                          )}
                        </p>
                      </div>
                      <p className="font-black text-fish-primary">{formatUsd(event.amountUsd)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {summary.payouts.batches.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.payouts.batches.slice(0, 3).map((batch) => (
                <Link key={batch.payoutBatchId} className="rounded-full border border-fish-gold/30 px-4 py-2 text-xs font-black text-fish-primary hover:border-fish-accent hover:text-white" href={batch.exportUrl as Route}>
                  Export batch {batch.payoutBatchId.slice(0, 14)}... / {formatUsd(batch.amountUsd)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {summary.receipts.length ? (
          <div className="fish-scroll-table mt-5">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-fish-accent">
                <tr>
                  <th className="border-b border-white/10 px-3 py-3">Receipt</th>
                  <th className="border-b border-white/10 px-3 py-3">Type / job</th>
                  <th className="border-b border-white/10 px-3 py-3">Provider</th>
                  <th className="border-b border-white/10 px-3 py-3">Model</th>
                  <th className="border-b border-white/10 px-3 py-3">Backend</th>
                  <th className="border-b border-white/10 px-3 py-3">Status</th>
                  <th className="border-b border-white/10 px-3 py-3">Usage</th>
                  <th className="border-b border-white/10 px-3 py-3">Cost</th>
                  <th className="border-b border-white/10 px-3 py-3">Signature</th>
                  <th className="border-b border-white/10 px-3 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {summary.receipts.slice(0, 8).map((receipt) => {
                  const needsReview = receipt.signatureStatus === "invalid" || receipt.signatureStatus === "missing";
                  return (
                    <tr key={receipt.receiptId} className={needsReview ? "bg-red-500/10 text-red-100" : "text-fish-primary"}>
                      <td className="border-b border-white/10 px-3 py-3 font-bold">
                        <Link className="text-fish-accent hover:text-white" href={`/api/proof/receipts/${receipt.receiptId}` as Route}>
                          {receipt.receiptId.slice(0, 14)}...
                        </Link>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">
                        <span className="block font-bold">{formatReceiptType(receipt.receiptType)}</span>
                        <span className="text-xs text-fish-secondary">{receipt.jobId.slice(0, 14)}...</span>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">{receipt.providerLabel}</td>
                      <td className="border-b border-white/10 px-3 py-3">
                        <span className="block font-bold">{receipt.model}</span>
                        <span className="text-xs text-fish-secondary">{receipt.workloadType}</span>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">{formatReceiptType(receipt.backend)}</td>
                      <td className="border-b border-white/10 px-3 py-3">{formatReceiptType(receipt.status)}</td>
                      <td className="border-b border-white/10 px-3 py-3">
                        <span className="block font-bold">{formatNumber(receipt.usage.inputTokens + receipt.usage.outputTokens)} tokens</span>
                        <span className="text-xs text-fish-secondary">{formatNumber(receipt.usage.gpuSeconds)} GPU sec</span>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">
                        <span className="block font-bold">{formatUsd(receipt.cost.providerCostUsd)}</span>
                        <span className="text-xs text-fish-secondary">{formatUsd(receipt.cost.userChargeUsd)} charge</span>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">
                        <span className={`block font-bold ${needsReview ? "text-red-100" : "text-white"}`}>{receipt.signatureStatus}</span>
                        <span className="text-xs text-fish-secondary">{receipt.hashes.canonicalReceiptHash.slice(0, 18)}...</span>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">{formatDateTime(receipt.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">
            No provider job proof yet. Select a provider, run a test job, and the first proof row appears here.
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

function formatReceiptType(value: ProviderJobReceipt["receiptType"] | ProviderJobReceipt["backend"] | ProviderJobReceipt["status"] | string) {
  return value.replaceAll("_", " ");
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function PayoutChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-fish-navy950/45 p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{formatUsd(value)}</p>
    </div>
  );
}
