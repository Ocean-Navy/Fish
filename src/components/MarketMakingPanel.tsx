import { Anchor, Coins, Gauge, Route } from "lucide-react";
import { formatCompact, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { MarketMakingSummary, MarketRouteState } from "@/lib/marketMaking";
import { StatusBadge } from "@/components/StatusBadge";

const cards = [
  { key: "routeNow", label: "Route now", icon: Route },
  { key: "pilotOnly", label: "Pilot lane", icon: Anchor },
  { key: "benchmarkFirst", label: "Bench first", icon: Gauge },
  { key: "costModels", label: "Cost models", icon: Coins }
] as const;

const routeLabels: Record<MarketRouteState, string> = {
  route_now: "Route now",
  pilot_only: "Pilot",
  benchmark_first: "Bench first",
  watch: "Watch",
  pause: "Paused"
};

const routeStyles: Record<MarketRouteState, string> = {
  route_now: "border-fish-success/35 bg-fish-success/15 text-fish-success",
  pilot_only: "border-fish-accent/35 bg-fish-accent/15 text-fish-accent",
  benchmark_first: "border-fish-gold/35 bg-fish-gold/15 text-fish-gold",
  watch: "border-fish-purple/35 bg-fish-purple/15 text-[#c9bdff]",
  pause: "border-fish-coral/35 bg-fish-coral/15 text-fish-coral"
};

export function MarketMakingPanel({ summary }: { summary: MarketMakingSummary }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Market map</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Route the catch</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Scorecards and benchmarks turn provider boats into simple routing lanes and honest price bands.
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

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Harbor note</p>
            <p className="mt-3 text-xl font-black leading-8 text-white">{summary.publicNarrative}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Mini label="Fish requests" value={formatNumber(summary.demand.fishRequests)} />
              <Mini label="Credits spent" value={formatNumber(summary.demand.creditsSpent)} />
              <Mini label="GPU supply" value={`${formatNumber(summary.supply.availableGpus)}/${formatNumber(summary.supply.totalGpus)}`} />
            </div>
          </div>
          <div className="rounded-3xl border border-fish-gold/20 bg-fish-gold/10 p-5">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-gold">Price flag</p>
            <p className="mt-3 text-3xl font-black text-white">{summary.totals.pricingConfidence}</p>
            <p className="mt-2 text-sm font-bold leading-6 text-fish-primary">
              Target margin {formatNumber(35)}%. Reserve buffer {formatNumber(10)}%. Prices stay hidden until benchmark evidence is strong enough.
            </p>
          </div>
        </div>

        {summary.costModels.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {summary.costModels.slice(0, 3).map((model) => (
              <div key={model.benchmarkId} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{model.benchmarkId}</p>
                <h3 className="mt-2 text-2xl font-black text-white">{model.title}</h3>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Mini label="Provider cost" value={formatUsd(model.providerCostUsdPer1kTokens)} />
                  <Mini label="User price" value={formatUsd(model.suggestedUserPriceUsdPer1kTokens)} />
                  <Mini label="Margin" value={formatUsd(model.grossMarginUsdPer1kTokens)} />
                  <Mini label="Evidence" value={model.pricingConfidence} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {summary.routes.length ? (
          <div className="fish-scroll-table mt-5">
            <table className="w-full min-w-[840px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-fish-accent">
                <tr>
                  <th className="border-b border-white/10 px-3 py-3">Boat</th>
                  <th className="border-b border-white/10 px-3 py-3">Lane</th>
                  <th className="border-b border-white/10 px-3 py-3">Score</th>
                  <th className="border-b border-white/10 px-3 py-3">Benchmark</th>
                  <th className="border-b border-white/10 px-3 py-3">Cost / 1k</th>
                  <th className="border-b border-white/10 px-3 py-3">Price / 1k</th>
                </tr>
              </thead>
              <tbody>
                {summary.routes.slice(0, 8).map((route) => (
                  <tr key={route.providerId} className="text-fish-primary">
                    <td className="border-b border-white/10 px-3 py-3 font-bold">{route.providerLabel}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${routeStyles[route.routeState]}`}>{routeLabels[route.routeState]}</span>
                      <span className="mt-2 block text-xs text-fish-secondary">{route.routeReason}</span>
                    </td>
                    <td className="border-b border-white/10 px-3 py-3">{formatNumber(route.score)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{route.benchmarkStatus}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatUsd(route.providerCostUsdPer1kTokens)}</td>
                    <td className="border-b border-white/10 px-3 py-3">{formatUsd(route.suggestedUserPriceUsdPer1kTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">
            No provider boats are ready for the market map yet.
          </div>
        )}

        {summary.warnings.length ? (
          <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">{summary.warnings[0]}</div>
        ) : null}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  );
}
