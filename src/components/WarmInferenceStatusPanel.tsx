import { Cpu, Gauge, ShieldCheck, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { WarmInferenceStatus } from "@/lib/warmInferenceStatus";
import { StatusBadge } from "@/components/StatusBadge";

export function WarmInferenceStatusPanel({ status }: { status: WarmInferenceStatus }) {
  const probeLabel = status.probe.state === "ok" ? "Ready" : status.probe.state === "failed" ? "Needs attention" : "Not ready";

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-5 shadow-harbor sm:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Warm demo node</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">Ocean demo readiness</h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-fish-secondary">
              Public-safe status for the warm vLLM route. It never exposes endpoint URLs, API keys, prompts, or outputs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={status.dataState} />
            <span className="text-sm font-bold text-fish-secondary">Checked {formatDateTime(status.generatedAt)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile icon={Waves} label="Route" value={status.routeActive ? "Selected" : "Standby"} />
          <StatusTile icon={Cpu} label="Provider" value={status.providerId} />
          <StatusTile icon={Gauge} label="Probe" value={probeLabel} />
          <StatusTile icon={ShieldCheck} label="Model" value={status.configuredModel ?? "Not set"} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Small label="Configured" value={status.configured ? "Yes" : "No"} />
          <Small label="Model visible" value={status.probe.modelVisible === null ? "-" : status.probe.modelVisible ? "Yes" : "No"} />
          <Small label="Latency" value={status.probe.latencyMs === null ? "-" : `${formatNumber(status.probe.latencyMs)} ms`} />
          <Small label="Anon cap" value={`${formatNumber(status.guardrails.dailyAnonymousQuota)} / day`} />
        </div>

        <div className="mt-4 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4 text-sm font-bold leading-6 text-fish-secondary">
          {status.probe.message}
        </div>

        {status.warnings.length ? (
          <div className="mt-4 rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-bold leading-6 text-fish-primary">
            {status.warnings[0]}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-fish-accent/15 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-fish-secondary">{label}</p>
        <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
      </div>
      <strong className="mt-3 block break-words text-2xl font-black text-white">{value}</strong>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-fish-accent/15 bg-fish-navy950/55 p-4">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}
