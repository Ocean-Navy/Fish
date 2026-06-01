"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { formatCompact, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { OceanSummary } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

async function fetchSummary(): Promise<OceanSummary> {
  const response = await fetch("/api/ocean/summary", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export function DashboardPreview({ initialSummary }: { initialSummary: OceanSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    setError(null);
    startTransition(async () => {
      try {
        setSummary(await fetchSummary());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Refresh failed");
      }
    });
  }

  const kpis = [
    ["GPU supply", formatNumber(summary.kpis.totalGpus)],
    ["Available now", formatNumber(summary.kpis.availableGpus)],
    ["Providers", formatNumber(summary.kpis.providerCount)],
    ["Lowest fee", summary.kpis.lowestListedGpuFee === null ? "-" : `${formatNumber(summary.kpis.lowestListedGpuFee)} listed`],
    ["Network jobs", formatCompact(summary.kpis.oceanNativeJobs)],
    ["Network revenue", summary.kpis.networkRevenueUsd === null ? "-" : formatUsd(summary.kpis.networkRevenueUsd)]
  ];

  return (
    <section id="dashboard" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Supply first</p>
          <h2 className="text-4xl font-black tracking-normal text-fish-primary md:text-6xl">Ocean Network supply dashboard</h2>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-fish-secondary">
            Fish starts by mapping compute supply, provider availability, network usage, and pricing before routing AI demand.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-fish-accent/40 bg-fish-raised/80 px-5 text-sm font-black text-fish-primary transition hover:border-fish-accent"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-fish-muted">
        <StatusBadge state={summary.dataState} />
        <span>Last updated {formatDateTime(summary.lastUpdated)}</span>
        <span>{summary.sourceCount} live source{summary.sourceCount === 1 ? "" : "s"}</span>
        {error ? <span className="text-fish-coral">Refresh failed: {error}</span> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-fish-accent/25 bg-fish-surface/75 p-5 shadow-glow">
            <p className="text-sm font-bold text-fish-secondary">{label}</p>
            <strong className="mt-3 block text-3xl font-black tracking-normal text-fish-primary">{value}</strong>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-3xl border border-fish-accent/25 bg-fish-surface/75 p-5">
          <h3 className="mb-4 text-xl font-black tracking-normal text-fish-primary">GPU supply by type</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-fish-accent">
                <tr>
                  <th className="border-b border-white/10 px-3 py-3">GPU</th>
                  <th className="border-b border-white/10 px-3 py-3">Total</th>
                  <th className="border-b border-white/10 px-3 py-3">Available</th>
                  <th className="border-b border-white/10 px-3 py-3">Providers</th>
                  <th className="border-b border-white/10 px-3 py-3">Fee signal</th>
                </tr>
              </thead>
              <tbody>
                {summary.gpuSupply.slice(0, 8).map((row) => (
                  <tr key={row.gpu} className="text-fish-primary">
                    <td className="border-b border-white/10 px-3 py-3 font-bold">{row.gpu}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatNumber(row.total)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatNumber(row.available)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatNumber(row.providers)}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      {row.lowestUsdHr !== null ? `${formatUsd(row.lowestUsdHr)}/hr` : row.lowestListedPrice !== null ? `${formatNumber(row.lowestListedPrice)} listed` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-fish-accent/25 bg-fish-surface/75 p-5">
          <h3 className="mb-4 text-xl font-black tracking-normal text-fish-primary">Provider scorecard</h3>
          <div className="space-y-3">
            {summary.providers.slice(0, 6).map((provider) => (
              <div key={provider.providerId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-fish-primary">{provider.label}</p>
                    <p className="mt-1 text-sm text-fish-secondary">{provider.region}</p>
                  </div>
                  <span className="rounded-full border border-fish-aqua/35 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-fish-aqua">
                    {provider.pilotEligible ? "candidate" : "review"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-fish-secondary">
                  {formatNumber(provider.availableGpus)} available GPU{provider.availableGpus === 1 ? "" : "s"} - {provider.gpuTypes.slice(0, 2).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {summary.warnings.length ? (
        <div className="mt-5 rounded-3xl border border-fish-gold/35 bg-fish-gold/10 p-5 text-sm leading-6 text-[#ffe6ac]">
          {summary.warnings[0]}
        </div>
      ) : null}
    </section>
  );
}
