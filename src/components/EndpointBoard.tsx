import { AdvancedModeToggle, AdvancedOnly } from "@/components/AdvancedMode";

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
  { method: "POST", path: "/api/support", state: "Live" },
  { method: "GET", path: "/api/support/export", state: "Crew" },
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

/**
 * Full endpoint board (moved from the old /api page). Operator/builder detail,
 * shown in Advanced mode on /docs.
 */
export function EndpointBoard() {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-fish-accent/25 bg-fish-surface/80 p-6 shadow-harbor sm:p-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Endpoint board</p>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-5xl">What is open?</h2>
          </div>
          <AdvancedModeToggle />
        </div>
        <AdvancedOnly>
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
          <p className="mt-4 text-sm font-bold leading-6 text-fish-secondary">
            This board is maintained by hand and can lag the code. For machine-readable truth, use <code className="font-black text-fish-primary">/api/health</code> and the OpenAPI file in the repo.
          </p>
        </AdvancedOnly>
      </div>
    </section>
  );
}
