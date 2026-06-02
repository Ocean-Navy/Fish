import type { Metadata } from "next";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import { RolePageShell } from "@/components/RolePageShell";

export const metadata: Metadata = {
  title: "Fish API - Status and future hatch",
  description: "Public Fish API status for health checks, Ocean supply, pilot forms, and AI access."
};

const steps = [
  { title: "Check the dock", body: "Use the health endpoint to confirm the service is awake." },
  { title: "Read supply", body: "See available Ocean compute for the dashboard." },
  { title: "Create a pilot key", body: "Issue a Fish key with starter credits." },
  { title: "Send a test request", body: "Use credits and get a clear response." }
];

const cards = [
  { label: "Live now", title: "/api/health", body: "Simple readiness check for deploys and server monitoring." },
  { label: "Live now", title: "/api/ocean/summary", body: "Dashboard summary with source-state labels and Ocean compute supply." },
  { label: "Pilot", title: "/api/ocean/batch/jobs", body: "Hash-only Docs batch receipt path, sample until a private Ocean batch adapter is connected." },
  { label: "Live now", title: "/api/waitlist", body: "Demand intake for users, builders, holders, and ecosystem partners." },
  { label: "Live now", title: "/api/warm/status", body: "Public-safe readiness for the active warm Ocean route." },
  { label: "Pilot", title: "/v1/chat/completions", body: "Familiar chat route with Fish keys, credits, and clear usage records." },
  { label: "Pilot", title: "/api/billing/plans", body: "Simple plan list with current and later options." },
  { label: "Pilot", title: "/api/billing/usage-analytics", body: "Total usage numbers without keys, prompts, outputs, or account rows." },
  { label: "Live now", title: "/api/routing/policy", body: "Public route guide for demo, outside AI, Ocean providers, and later privacy stages." },
  { label: "Pilot", title: "/api/proof/receipts", body: "Provider proof records with public-safe detail links." },
  { label: "Crew only", title: "/api/proof/receipts/export", body: "CSV or JSON export for the operating team." }
];

const endpoints = [
  { method: "GET", path: "/api/health", state: "Live" },
  { method: "GET", path: "/api/ocean/summary", state: "Live" },
  { method: "GET", path: "/api/ocean/resources", state: "Live" },
  { method: "GET", path: "/api/ocean/providers", state: "Live" },
  { method: "GET", path: "/api/ocean/batch/jobs", state: "Pilot" },
  { method: "POST", path: "/api/ocean/batch/jobs", state: "Pilot" },
  { method: "GET", path: "/api/billing/plans", state: "Pilot" },
  { method: "GET", path: "/api/billing/usage-analytics", state: "Pilot" },
  { method: "GET", path: "/api/routing/policy", state: "Live" },
  { method: "GET", path: "/api/warm/status", state: "Live" },
  { method: "POST", path: "/api/meal/order", state: "Pilot" },
  { method: "GET", path: "/api/providers/pilot", state: "Live" },
  { method: "POST", path: "/api/providers/jobs", state: "Pilot" },
  { method: "GET", path: "/api/proof/summary", state: "Pilot" },
  { method: "GET", path: "/api/proof/receipts", state: "Pilot" },
  { method: "GET", path: "/api/proof/receipts/:receiptId", state: "Pilot" },
  { method: "GET", path: "/api/proof/receipts/export", state: "Pilot" },
  { method: "GET", path: "/api/proof/providers", state: "Pilot" },
  { method: "GET", path: "/api/proof/benchmarks", state: "Pilot" },
  { method: "POST", path: "/api/proof/benchmarks", state: "Pilot" },
  { method: "GET", path: "/api/proof/market-making", state: "Pilot" },
  { method: "GET", path: "/api/proof/payouts", state: "Pilot" },
  { method: "POST", path: "/api/proof/payouts", state: "Pilot" },
  { method: "GET", path: "/api/proof/payouts/batches", state: "Pilot" },
  { method: "GET", path: "/api/proof/payouts/batches/:batchId/export", state: "Pilot" },
  { method: "POST", path: "/api/proof/payouts/batches", state: "Pilot" },
  { method: "GET", path: "/api/proof/payouts/export", state: "Pilot" },
  { method: "GET", path: "/api/staking/summary", state: "Pilot" },
  { method: "GET", path: "/api/staking/positions", state: "Pilot" },
  { method: "POST", path: "/api/staking/positions", state: "Pilot" },
  { method: "POST", path: "/api/waitlist", state: "Live" },
  { method: "POST", path: "/api/providers/apply", state: "Live" },
  { method: "POST", path: "/v1/api_keys", state: "Pilot" },
  { method: "GET", path: "/v1/models", state: "Pilot" },
  { method: "POST", path: "/v1/chat/completions", state: "Pilot" },
  { method: "GET", path: "/v1/balance", state: "Pilot" },
  { method: "GET", path: "/v1/usage", state: "Pilot" }
];

export default function ApiPage() {
  return (
    <RolePageShell
      eyebrow="Signal flags"
      title="API status."
      subtitle="The hatch is small today: keys, credits, and clear AI requests."
      image="/assets/generated/fish-role-builder.png"
      imageAlt="Ocean Navy API hatch in a Venice market workshop"
      chips={["Health", "Supply", "Keys", "AI route"]}
      primaryAction={{ label: "Try chat", href: "/chat" }}
      secondaryAction={{ label: "Read docs", href: "/docs" }}
      steps={steps}
      cards={cards}
      note="Fish will not call a route Ocean-powered until selected Ocean providers are really running the work."
    >
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Endpoint board</p>
              <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">What is open?</h2>
            </div>
            <p className="text-lg font-black text-fish-accent">Green flags first. Real providers later.</p>
          </div>

          <div className="mb-4 flex flex-wrap gap-3">
            <Link className="inline-flex h-10 items-center rounded-full border border-fish-accent/35 px-4 text-xs font-black text-fish-accent hover:text-white" href="/account">
              Open account tab
            </Link>
            <Link className="inline-flex h-10 items-center rounded-full border border-fish-accent/35 px-4 text-xs font-black text-fish-accent hover:text-white" href={"/ask" as NextRoute}>
              Open meal counter
            </Link>
            <Link className="inline-flex h-10 items-center rounded-full border border-fish-accent/35 px-4 text-xs font-black text-fish-accent hover:text-white" href={"/routing" as NextRoute}>
              Open route compass
            </Link>
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
