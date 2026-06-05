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
  { label: "Live now", title: "/api/dashboard/summary", body: "One public summary for Fish usage, route status, warm AI readiness, and Ocean supply." },
  { label: "Crew only", title: "/api/ocean/refresh", body: "Force a fresh Ocean supply fetch with an admin token." },
  { label: "Pilot", title: "/api/ocean/batch/jobs", body: "Hash-only batch dish receipt path, sample until a private Ocean batch adapter is connected." },
  { label: "Pilot", title: "/api/ocean/batch/readiness", body: "Milestone 3 proof gate for adapter readiness and non-sample Ocean batch receipts." },
  { label: "Live now", title: "/api/waitlist", body: "Demand intake for users, builders, holders, and ecosystem partners." },
  { label: "Live now", title: "/api/warm/status", body: "Public-safe warm route snapshot; live probes are crew-only." },
  { label: "Crew only", title: "/api/ocean/provider-readiness", body: "Admin check for selected-provider config, proof endpoint, models, and optional chat probe." },
  { label: "Live now", title: "/api/features", body: "Public AI menu with simple dishes, model aliases, route labels, and caps." },
  { label: "Pilot", title: "/api/dishes/:dishId/run", body: "Run a Fish dish with server-side prompts, credits, route labels, and receipts." },
  { label: "Pilot", title: "/v1/chat/completions", body: "Familiar chat route with Fish keys, credits, and clear usage records." },
  { label: "Pilot", title: "/v1/api_keys/current", body: "Rename, rotate, or revoke the current Fish key." },
  { label: "Pilot", title: "/api/billing/plans", body: "Simple plan list with current and later options." },
  { label: "Pilot", title: "/api/billing/checkout/stripe", body: "Create a card checkout session for prepaid credits when Stripe is configured." },
  { label: "Pilot", title: "/api/billing/checkout/usdc", body: "Create a Base USDC payment request and confirm a transaction hash." },
  { label: "Pilot", title: "/api/staking/wallet-intents", body: "Record signed OCEAN lock intent without issuing credits or exposing wallet addresses." },
  { label: "Crew only", title: "/api/billing/subscriptions", body: "Activate a pilot plan and grant subscription credits." },
  { label: "Crew only", title: "/api/billing/topups", body: "Add pilot credits to an account with an admin token." },
  { label: "Crew only", title: "/api/billing/usage-analytics", body: "Admin-only usage numbers without keys, prompts, outputs, or account rows." },
  { label: "Live now", title: "/api/routing/policy", body: "Public route guide for demo, outside AI, Ocean providers, and later privacy stages." },
  { label: "Pilot", title: "/api/proof/receipts", body: "Provider proof records with public-safe detail links." },
  { label: "Pilot", title: "/api/proof/provider-bonds", body: "Public-safe OCEAN bond status for selected providers." },
  { label: "Crew only", title: "/api/proof/receipts/export", body: "CSV or JSON export for the operating team." }
];

const endpoints = [
  { method: "GET", path: "/api/health", state: "Live" },
  { method: "GET", path: "/api/ocean/summary", state: "Live" },
  { method: "GET", path: "/api/dashboard/summary", state: "Live" },
  { method: "GET", path: "/api/ocean/resources", state: "Live" },
  { method: "GET", path: "/api/ocean/providers", state: "Live" },
  { method: "POST", path: "/api/ocean/refresh", state: "Crew" },
  { method: "POST", path: "/api/ocean/provider-readiness", state: "Crew" },
  { method: "GET", path: "/api/ocean/batch/jobs", state: "Pilot" },
  { method: "POST", path: "/api/ocean/batch/jobs", state: "Pilot" },
  { method: "GET", path: "/api/ocean/batch/readiness", state: "Pilot" },
  { method: "GET", path: "/api/billing/plans", state: "Pilot" },
  { method: "POST", path: "/api/billing/checkout/stripe", state: "Pilot" },
  { method: "POST", path: "/api/billing/webhooks/stripe", state: "Pilot" },
  { method: "POST", path: "/api/billing/checkout/usdc", state: "Pilot" },
  { method: "POST", path: "/api/billing/checkout/usdc/confirm", state: "Pilot" },
  { method: "POST", path: "/api/billing/subscriptions", state: "Crew" },
  { method: "POST", path: "/api/billing/topups", state: "Crew" },
  { method: "GET", path: "/api/billing/usage-analytics", state: "Crew only" },
  { method: "GET", path: "/api/routing/policy", state: "Live" },
  { method: "GET", path: "/api/warm/status", state: "Live" },
  { method: "GET", path: "/api/features", state: "Live" },
  { method: "POST", path: "/api/dishes/:dishId/run", state: "Pilot" },
  { method: "POST", path: "/api/meal/order", state: "Pilot" },
  { method: "GET", path: "/api/providers/pilot", state: "Live" },
  { method: "POST", path: "/api/providers/jobs", state: "Crew" },
  { method: "GET", path: "/api/proof/summary", state: "Pilot" },
  { method: "GET", path: "/api/proof/receipts", state: "Pilot" },
  { method: "GET", path: "/api/proof/receipts/:receiptId", state: "Pilot" },
  { method: "GET", path: "/api/proof/receipts/export", state: "Crew" },
  { method: "GET", path: "/api/proof/providers", state: "Pilot" },
  { method: "GET", path: "/api/proof/benchmarks", state: "Pilot" },
  { method: "POST", path: "/api/proof/benchmarks", state: "Crew" },
  { method: "GET", path: "/api/proof/market-making", state: "Pilot" },
  { method: "GET", path: "/api/proof/provider-bonds", state: "Pilot" },
  { method: "POST", path: "/api/proof/provider-bonds", state: "Crew" },
  { method: "GET", path: "/api/proof/payouts", state: "Crew" },
  { method: "POST", path: "/api/proof/payouts", state: "Crew" },
  { method: "GET", path: "/api/proof/payouts/batches", state: "Crew" },
  { method: "GET", path: "/api/proof/payouts/batches/:batchId/export", state: "Crew" },
  { method: "POST", path: "/api/proof/payouts/batches", state: "Crew" },
  { method: "GET", path: "/api/proof/payouts/export", state: "Crew" },
  { method: "GET", path: "/api/staking/summary", state: "Pilot" },
  { method: "GET", path: "/api/staking/positions", state: "Pilot" },
  { method: "POST", path: "/api/staking/positions", state: "Crew" },
  { method: "GET", path: "/api/staking/wallet-intents", state: "Pilot" },
  { method: "POST", path: "/api/staking/wallet-intents", state: "Pilot" },
  { method: "POST", path: "/api/waitlist", state: "Live" },
  { method: "POST", path: "/api/providers/apply", state: "Live" },
  { method: "GET", path: "/v1/api_keys", state: "Pilot" },
  { method: "POST", path: "/v1/api_keys", state: "Crew" },
  { method: "PATCH", path: "/v1/api_keys/current", state: "Pilot" },
  { method: "DELETE", path: "/v1/api_keys/current", state: "Pilot" },
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
