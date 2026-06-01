import { CheckCircle2, ClipboardList, UserCheck } from "lucide-react";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ProviderPilotRegistry } from "@/lib/providerPilot";
import { StatusBadge } from "@/components/StatusBadge";

const stats = [
  { key: "applications", label: "Applications", icon: ClipboardList },
  { key: "allowed", label: "Allowed", icon: CheckCircle2 },
  { key: "fishReady", label: "Fish-ready", icon: CheckCircle2 },
  { key: "applied", label: "In review", icon: UserCheck }
] as const;

export function ProviderPilotPanel({ registry, compact = false }: { registry: ProviderPilotRegistry; compact?: boolean }) {
  const providers = registry.providers.slice(0, compact ? 3 : 6);

  return (
    <section className={compact ? "" : "mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"}>
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Provider pilot</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Dock registry</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Provider applications stay separate from selected routes. Public labels hide contacts, exact endpoints, and payout details.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={registry.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Updated {formatDateTime(registry.lastUpdated)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.key} className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-fish-secondary">{stat.label}</p>
                  <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
                </div>
                <strong className="mt-3 block text-3xl font-black text-white">{formatNumber(registry.counts[stat.key])}</strong>
              </div>
            );
          })}
        </div>

        {providers.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {providers.map((provider) => {
              const allowlist = registry.allowlist.find((entry) => entry.providerId === provider.providerId);
              return (
                <article key={provider.providerId} className="rounded-3xl border border-fish-accent/15 bg-fish-navy950/55 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-black text-white">{provider.displayName}</h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{provider.publicLabel}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${provider.pilotStatus === "allowed" ? "bg-emerald-400/15 text-emerald-200" : "bg-fish-gold/15 text-fish-gold"}`}>
                      {provider.pilotStatus}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-bold leading-6 text-fish-secondary">{provider.capacitySummary}</p>
                  <p className="mt-2 text-sm font-bold text-fish-secondary">{provider.region}</p>
                  <div className="mt-4 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">Fish-ready</p>
                      <span className="rounded-full bg-fish-accent/15 px-3 py-1 text-xs font-black text-fish-accent">{provider.readiness.label}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {provider.readiness.checks.map((check) => (
                        <span
                          key={check.id}
                          className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.06em] ${
                            check.ready ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/15 bg-white/[0.03] text-fish-muted"
                          }`}
                        >
                          {check.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {allowlist ? (
                    <div className="mt-4 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-primary">
                      {allowlist.allowedWorkloadTypes.join(", ")} · {allowlist.allowedModels.join(", ")} · max {formatUsd(allowlist.maxDailySpendUsd)}/day
                      {allowlist.noPromptOutputLogging ? " · no logs" : ""}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-fish-accent/25 bg-fish-navy950/40 p-6 text-lg font-black leading-8 text-fish-primary">
            No providers in the registry yet. The dock fills from provider pilot applications.
          </div>
        )}

        {registry.warnings.length ? (
          <div className="mt-5 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">
            {registry.warnings[0]}
          </div>
        ) : null}
      </div>
    </section>
  );
}
