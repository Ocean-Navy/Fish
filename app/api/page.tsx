import type { Metadata } from "next";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish API - Status and future hatch",
  description: "Public Fish API status placeholder for health, Ocean supply data, pilot forms, and the future AI API."
};

const steps = [
  { title: "Check the dock", body: "Use the health endpoint to confirm the service is awake." },
  { title: "Read supply", body: "Ocean supply endpoints expose dashboard-ready GPU and provider data." },
  { title: "Join the pilot", body: "Waitlist and provider forms already write structured submissions." },
  { title: "Open the hatch", body: "The future AI API adds keys, models, usage receipts, and credit debits." }
];

const cards = [
  { label: "Live now", title: "/api/health", body: "Simple readiness check for deploys and server monitoring." },
  { label: "Live now", title: "/api/ocean/summary", body: "Dashboard summary with source-state labels and Ocean compute supply." },
  { label: "Live now", title: "/api/waitlist", body: "Demand intake for users, builders, holders, and ecosystem partners." },
  { label: "Next", title: "/v1/chat/completions", body: "OpenAI-style AI route once keys, metering, receipts, and cost tracking are ready." }
];

const endpoints = [
  { method: "GET", path: "/api/health", state: "Live" },
  { method: "GET", path: "/api/ocean/summary", state: "Live" },
  { method: "GET", path: "/api/ocean/resources", state: "Live" },
  { method: "GET", path: "/api/ocean/providers", state: "Live" },
  { method: "POST", path: "/api/waitlist", state: "Live" },
  { method: "POST", path: "/api/providers/apply", state: "Live" },
  { method: "GET", path: "/v1/models", state: "Planned" },
  { method: "POST", path: "/v1/chat/completions", state: "Planned" }
];

export default function ApiPage() {
  return (
    <RolePageShell
      eyebrow="Signal flags"
      title="API status."
      subtitle="The hatch is small today. It gets useful before it gets fancy."
      image="/assets/generated/fish-role-builder.png"
      imageAlt="Ocean Navy API hatch in a Venice market workshop"
      chips={["Health", "Supply", "Forms", "AI API next"]}
      primaryAction={{ label: "Read docs", href: "/docs" }}
      secondaryAction={{ label: "Open dashboard", href: "/dashboard" }}
      steps={steps}
      cards={cards}
      note="API rule: no fake AI endpoint. Chat, models, credits, and receipts ship only when metering and provider proof are ready."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Endpoint board</p>
              <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">What is open?</h2>
            </div>
            <p className="text-lg font-black text-fish-accent">Green flags first. Big routes later.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {endpoints.map((endpoint) => (
              <div key={`${endpoint.method}:${endpoint.path}`} className="grid grid-cols-[4.25rem_1fr_auto] items-center gap-3 rounded-2xl border border-fish-accent/15 bg-white/[0.035] p-4">
                <span className="rounded-full bg-fish-accent/15 px-3 py-1 text-xs font-black text-fish-accent">{endpoint.method}</span>
                <code className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-black text-white sm:text-base">{endpoint.path}</code>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${endpoint.state === "Live" ? "bg-emerald-400/15 text-emerald-200" : "bg-fish-gold/15 text-fish-gold"}`}>
                  {endpoint.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </RolePageShell>
  );
}
