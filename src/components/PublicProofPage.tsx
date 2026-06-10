import { ChevronDown, EyeOff, Fish, Gauge, ReceiptText, ShieldCheck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { formatCompact, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { CapacitySettlementSummary } from "@/lib/capacitySettlements";
import type { BenchmarkSummary } from "@/lib/providerBenchmarks";
import type { OceanBatchSummary } from "@/lib/oceanBatch";
import type { OceanProofReadiness } from "@/lib/oceanProofReadiness";
import type { ProofSummary } from "@/lib/providerJobs";
import type { ProviderScorecardSummary } from "@/lib/providerScorecard";
import type { DataState } from "@/lib/types";
import { MobileNavMenu } from "@/components/MobileNavMenu";
import { StatusBadge } from "@/components/StatusBadge";

export function PublicProofPage({
  proof,
  scorecard,
  benchmarks,
  batch,
  oceanProof,
  capacitySettlements
}: {
  proof: ProofSummary;
  scorecard: ProviderScorecardSummary;
  benchmarks: BenchmarkSummary;
  batch: OceanBatchSummary;
  oceanProof: OceanProofReadiness;
  capacitySettlements: CapacitySettlementSummary;
}) {
  const hasLiveProof = proof.dataState === "live" && proof.verifiedReceipts > 0;
  const providerRows = scorecard.rows.filter((row) => row.selected || row.jobsRouted || row.benchmarkRuns).slice(0, 4);
  const receiptRows = proof.receipts.slice(0, 5);
  const benchmarkRows = benchmarks.matrix.slice(0, 6);
  const hasOceanBatchProof = oceanProof.proof.hasNonSampleReceipt;
  const heroState = hasOceanBatchProof || oceanProof.trafficReady ? oceanProof.dataState : proof.dataState;
  const heroCopy = hasOceanBatchProof
    ? oceanProof.claim.headline
    : hasLiveProof
      ? "Selected provider runs have public proof."
      : oceanProof.claim.headline;
  const heroUpdatedAt = oceanProof.proof.latestReceiptAt ?? proof.lastUpdated;
  const oceanNextSteps = oceanProof.blockers.map(publicOceanBlocker);
  const verdict = proofVerdict({ hasLiveProof, oceanProof });
  const boundaryCards = proofBoundaryCards({ hasOceanBatchProof, oceanProof });
  const plainProofCards = [
    {
      icon: Utensils,
      label: "Dish",
      title: hasOceanBatchProof ? `${formatCompact(oceanProof.proof.nonSampleJobs)} Ocean ticket${oceanProof.proof.nonSampleJobs === 1 ? "" : "s"}` : "Waiting for first dish",
      body: hasOceanBatchProof ? "A Fish dish has a non-sample Ocean path ticket." : "The first Ocean batch dish will make this card light up."
    },
    {
      icon: ReceiptText,
      label: "Ticket",
      title: proof.verifiedReceipts ? `${formatCompact(proof.verifiedReceipts)} proof tickets` : "No proof tickets yet",
      body: "Tickets show ids, hashes, usage, status, and timing."
    },
    {
      icon: EyeOff,
      label: "Privacy",
      title: "Orders stay off proof",
      body: "Public proof does not show raw prompts, files, or answers."
    },
    {
      icon: ShieldCheck,
      label: "Claim",
      title: hasOceanBatchProof ? oceanProof.claim.title : "Early proof",
      body: hasOceanBatchProof ? oceanProof.claim.boundary : "Sample and missing states stay clearly labeled."
    }
  ];

  return (
    <main id="main-content" className="min-h-screen overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-fish-accent/20 bg-fish-navy950/70 px-3 pl-4 backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3" aria-label="Fish home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-fish-accent/35 bg-fish-accent/15 text-fish-accent">
              <Fish className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-black text-white">Fish</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-black text-fish-secondary md:flex" aria-label="Proof navigation">
            <a className="hover:text-white" href="#proof-story">What counts</a>
            <a className="hover:text-white" href="#activity">Tickets</a>
            <Link className="hover:text-white" href={"/privacy" as Route}>Data policy</Link>
            <Link className="hover:text-white" href="/dashboard">Dashboard</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-fish-accent to-fish-aqua px-4 text-sm font-black text-fish-navy950" href="/#pilot">
              Join
            </Link>
            <MobileNavMenu
              links={[
                { href: "/proof#proof-story", label: "What counts" },
                { href: "/proof#activity", label: "Tickets" },
                { href: "/privacy", label: "Data policy" },
                { href: "/dashboard", label: "Dashboard" }
              ]}
            />
          </div>
        </div>
      </header>

      <section className="relative min-h-[92vh] px-4 pt-28 sm:px-6 lg:px-8">
        <Image src="/assets/generated/fish-market-hero.webp" alt="" fill priority sizes="100vw" className="fish-proof-hero-image object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,10,30,0.98)_0%,rgba(2,10,30,0.84)_44%,rgba(2,10,30,0.24)_100%)]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-fish-navy950 to-transparent" aria-hidden="true" />

        <div className="relative mx-auto grid min-h-[calc(92vh-7rem)] max-w-7xl content-center gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-fish-gold/35 bg-fish-gold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-fish-gold">
              Public proof harbor
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-none text-white sm:text-7xl lg:text-8xl">What is proven?</h1>
            <p className="mt-6 max-w-2xl text-2xl font-black leading-tight text-fish-primary sm:text-4xl">
              {heroCopy}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <StatusBadge state={heroState} />
              <span className="rounded-full border border-fish-accent/25 bg-fish-navy950/65 px-4 py-2 text-sm font-black text-fish-secondary">
                Updated {formatDateTime(heroUpdatedAt)}
              </span>
            </div>
            <p className="mt-5 max-w-2xl rounded-[1.25rem] border border-white/10 bg-fish-navy950/65 p-4 text-base font-black leading-7 text-fish-secondary">
              {verdict.boundary}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <HeroCounter icon={Gauge} label="Current proof" value={verdict.title} />
            <HeroCounter icon={Utensils} label="First Ocean dish" value={hasOceanBatchProof ? "Recorded" : "Waiting"} />
            <HeroCounter icon={ReceiptText} label="Public tickets" value={formatCompact(proof.verifiedReceipts + oceanProof.proof.nonSampleJobs)} />
            <HeroCounter icon={EyeOff} label="Raw orders" value="Hidden" />
          </div>
        </div>
      </section>

      <section id="proof-story" className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Plain proof</p>
              <h2 className="mt-2 text-4xl font-black text-white sm:text-5xl">What counts here?</h2>
            </div>
            <Link className="w-fit rounded-full border border-fish-accent/35 px-4 py-2 text-sm font-black text-fish-accent hover:bg-fish-accent/10" href={"/privacy" as Route}>
              Data policy
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {plainProofCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.label} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">{card.label}</p>
                    <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-2xl font-black leading-tight text-white">{card.title}</h3>
                  <p className="mt-3 text-sm font-bold leading-6 text-fish-secondary">{card.body}</p>
                </article>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {boundaryCards.map((card) => (
              <article key={card.label} className={`rounded-[1.5rem] border p-5 shadow-harbor ${card.className}`}>
                <p className="text-xs font-black uppercase tracking-[0.12em]">{card.label}</p>
                <h3 className="mt-3 text-2xl font-black leading-tight text-white">{card.title}</h3>
                <p className="mt-3 text-sm font-bold leading-6">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <MetricGroup title="At A Glance" eyebrow="Harbor signs" state={proof.dataState}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProofTile label="Jobs routed" value={formatCompact(proof.oceanJobsRouted)} detail={`${formatCompact(proof.failedJobs + proof.timedOutJobs)} need review`} />
          <ProofTile label="Proof tickets" value={formatCompact(proof.verifiedReceipts)} detail={`${formatCompact(proof.receiptVerificationFailures)} need review`} />
          <ProofTile label="Batch dishes" value={formatCompact(batch.jobs)} detail={batch.dataState === "sample" ? "sample path" : "private adapter"} />
          <ProofTile label="Provider payouts" value={formatUsd(proof.payouts.totals.paid)} detail={`${formatUsd(proof.payouts.totals.outstandingUsd)} open`} />
        </div>
      </MetricGroup>

      <MetricGroup title="Ocean Path" eyebrow="Proof gate" state={oceanProof.dataState}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProofTile label="Ocean kitchen" value={oceanProof.trafficReady ? "Connected" : "Waiting"} detail={oceanProof.trafficReady ? "Fish can send test dishes through the private Ocean path." : "The private Ocean path is not ready for testers yet."} />
          <ProofTile label="First Ocean dish" value={hasOceanBatchProof ? "Recorded" : "Waiting"} detail={hasOceanBatchProof ? `${formatCompact(oceanProof.proof.nonSampleJobs)} public-safe ticket${oceanProof.proof.nonSampleJobs === 1 ? "" : "s"}` : "Run one successful non-sample dish first."} />
          <ProofTile label="Proof level" value={sourceLabel(oceanProof.dataState)} detail={hasOceanBatchProof ? "Local Ocean Node evidence, not external paid demand." : "No Ocean workload claim yet."} />
          <ProofTile label="Daily test cap" value={formatUsd(oceanProof.route.dailyBudgetUsd)} detail="Small public-test budget guard." />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">Next proof step</p>
            {oceanNextSteps.length ? (
              <ul className="mt-4 space-y-2">
                {oceanNextSteps.map((step) => (
                  <li key={step} className="rounded-2xl border border-fish-coral/25 bg-fish-coral/10 p-3 text-sm font-black leading-6 text-fish-primary">
                    {step}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-3 text-sm font-black leading-6 text-emerald-100">
                Local Ocean batch proof is ready for public review. Keep it labeled snapshot until an external Oncompute job proves paid third-party demand.
              </p>
            )}
          </div>
          <div className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">What this means</p>
            <div className="mt-4 space-y-2">
              <MeaningRow label="For users" value={oceanProof.proofReady ? "A test dish has Ocean proof." : "Orders are still in demo or setup mode."} />
              <MeaningRow label="For builders" value={oceanProof.trafficReady ? "The private batch path is reachable." : "Use JSON proof only as setup evidence."} />
              <MeaningRow label="For Ocean ecosystem" value={hasOceanBatchProof ? "Fish can show local Ocean Node usage." : "Usage proof still needs the first Ocean dish."} />
              <MeaningRow label="Not claimed" value={oceanProof.claim.notClaimed.join(" / ")} />
            </div>
          </div>
        </div>
      </MetricGroup>

      <MetricGroup title="Dish Tickets" eyebrow="Ocean batch path" state={batch.dataState}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProofTile label="Batch jobs" value={formatCompact(batch.jobs)} />
          <ProofTile label="Succeeded" value={formatCompact(batch.succeededJobs)} />
          <ProofTile label="Tokens" value={formatCompact(batch.tokensProcessed)} />
          <ProofTile label="Provider cost" value={formatUsd(batch.providerCostUsd)} />
        </div>
        {batch.receipts.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {batch.receipts.slice(0, 4).map((receipt) => (
              <article key={receipt.receiptId} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">{receipt.taskType.replaceAll("_", " ")}</p>
                <h3 className="mt-3 text-xl font-black text-white">{receipt.status.replaceAll("_", " ")}</h3>
                <p className="mt-3 text-sm font-bold text-fish-secondary">{formatCompact(receipt.usage.totalTokens)} tokens / {formatNumber(receipt.usage.gpuSeconds)} GPU sec</p>
                <p className="mt-3 break-all text-xs font-bold leading-5 text-fish-secondary">{receipt.hashes.canonicalReceiptHash.slice(0, 28)}...</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyHarbor text="No batch dish receipts yet. The first batch receipt will appear here." />
          </div>
        )}
      </MetricGroup>

      <MetricGroup id="boats" title="Provider Boats" eyebrow="Selected routes" state={scorecard.dataState}>
        {providerRows.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {providerRows.map((provider) => (
              <article key={provider.providerId} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">{provider.selected ? "Selected boat" : "Proof trail"}</p>
                <h3 className="mt-3 text-2xl font-black leading-tight text-white">{provider.providerLabel}</h3>
                <p className="mt-2 text-sm font-bold text-fish-secondary">{provider.region} / {provider.gpuTypes.join(", ") || "GPU TBD"}</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <MiniStat label="Score" value={formatNumber(provider.score)} />
                  <MiniStat label="Receipts" value={formatCompact(provider.verifiedReceipts)} />
                  <MiniStat label="Jobs" value={formatCompact(provider.jobsRouted)} />
                  <MiniStat label="Paid" value={formatUsd(provider.paidUsd)} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyHarbor text="No provider proof yet. The first selected provider test will make this section light up." />
        )}
      </MetricGroup>

      <MetricGroup id="activity" title="Ticket Net" eyebrow="Public proof" state={proof.dataState}>
        {receiptRows.length ? (
          <div className="grid gap-3 lg:grid-cols-5">
            {receiptRows.map((receipt) => (
              <Link
                key={receipt.receiptId}
                href={`/api/proof/receipts/${receipt.receiptId}` as Route}
                aria-label={`Open raw receipt JSON for ${receipt.providerLabel}`}
                className="group rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor hover:border-fish-accent/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">{receipt.status.replaceAll("_", " ")}</p>
                <h3 className="mt-3 text-lg font-black text-white group-hover:text-fish-accent">{receipt.providerLabel}</h3>
                <p className="mt-3 break-all text-xs font-bold leading-5 text-fish-secondary">{receipt.canonicalReceiptHash.slice(0, 28)}...</p>
                <p className="mt-4 text-sm font-black text-fish-primary">{receipt.signatureStatus}</p>
                <p className="mt-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-fish-muted">Opens raw JSON</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyHarbor text="No public activity yet. Run selected provider jobs to publish public-safe proof." />
        )}
      </MetricGroup>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <details className="group rounded-[1.75rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
              <span>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">Builder details</span>
                <span className="mt-2 block text-3xl font-black text-white sm:text-4xl">Open the proof ledger</span>
              </span>
              <ChevronDown className="h-6 w-6 shrink-0 text-fish-accent transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-6 space-y-10 border-t border-fish-accent/15 pt-8">
              <MetricGroup compact title="Money Details" eyebrow="Provider payouts" state={proof.payouts.dataState}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <ProofTile label="Accrued" value={formatUsd(proof.payouts.totals.accrued)} />
                  <ProofTile label="Review" value={formatUsd(proof.payouts.totals.review)} />
                  <ProofTile label="Approved" value={formatUsd(proof.payouts.totals.approved)} />
                  <ProofTile label="Paid" value={formatUsd(proof.payouts.totals.paid)} />
                  <ProofTile label="Disputed" value={formatUsd(proof.payouts.totals.disputed)} />
                  <ProofTile label="Voided" value={formatUsd(proof.payouts.totals.voided)} />
                </div>
              </MetricGroup>

              <MetricGroup compact title="Capacity Details" eyebrow="Paid demand" state={capacitySettlements.dataState}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ProofTile label="Settlements" value={formatCompact(capacitySettlements.totals.settlements)} />
                  <ProofTile label="USDC recorded" value={formatUsd(capacitySettlements.totals.grossUsdcAmount)} />
                  <ProofTile label="Net to pool" value={formatUsd(capacitySettlements.totals.netUsdcAmount)} />
                  <ProofTile label="Operator fee" value={formatUsd(capacitySettlements.totals.operatorFeeUsdc)} />
                </div>
                {capacitySettlements.settlements.length ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {capacitySettlements.settlements.slice(0, 4).map((settlement) => (
                      <article key={settlement.settlementId} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-navy950/45 p-5 shadow-harbor">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">{settlement.settlementSource.replaceAll("_", " ")}</p>
                        <h3 className="mt-3 text-xl font-black text-white">{formatUsd(settlement.netUsdcAmount)} net</h3>
                        <p className="mt-3 text-sm font-bold text-fish-secondary">
                          {formatUsd(settlement.grossUsdcAmount)} recorded / {formatUsd(settlement.operatorFeeUsdc)} fee
                        </p>
                        <p className="mt-3 break-all text-xs font-bold leading-5 text-fish-secondary">{settlement.transactionHashPrefix ?? "No tx hash recorded"}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3">
                    <EmptyHarbor text="No capacity-pool settlement records yet. Paid demand records will appear here after operator review." />
                  </div>
                )}
                {capacitySettlements.warnings.length ? (
                  <div className="mt-3 grid gap-2">
                    {capacitySettlements.warnings.map((warning) => (
                      <p key={warning} className="rounded-2xl border border-fish-gold/25 bg-fish-gold/10 p-4 text-sm font-black leading-6 text-fish-primary">
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </MetricGroup>

              <MetricGroup compact title="Route Tests" eyebrow="Deep proof" state={benchmarks.dataState}>
                {benchmarkRows.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {benchmarkRows.map((row) => (
                      <article key={`${row.providerId}-${row.benchmarkId}`} className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-navy950/45 p-5 shadow-harbor">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.12em] text-fish-gold">{row.title}</p>
                            <h3 className="mt-2 text-xl font-black text-white">{row.providerLabel}</h3>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(row.latestStatus)}`}>{row.latestStatus.replaceAll("_", " ")}</span>
                        </div>
                        <p className="mt-4 text-sm font-bold text-fish-secondary">{row.inputSizeBucket} to {row.outputSizeBucket} / {row.workloadType}</p>
                        <p className="mt-3 text-sm font-black text-fish-primary">{row.sampleSize ? `${formatNumber(row.sampleSize)} sample${row.sampleSize === 1 ? "" : "s"}` : "Waiting for first catch"}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyHarbor text="No selected benchmark board yet. Selected providers will appear here even before their first run." />
                )}
              </MetricGroup>
            </div>
          </details>
        </div>
      </section>

      <footer className="border-t border-fish-accent/15 px-4 py-8 text-sm font-bold text-fish-secondary sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>Public proof only. Private operating details stay out of this page.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="text-fish-accent hover:text-white" href="/dashboard">Open builder dashboard</Link>
            <Link className="text-fish-gold hover:text-white" href={"/privacy" as Route}>Data policy</Link>
            <Link className="text-fish-gold hover:text-white" href={"/support" as Route}>Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function MetricGroup({ children, compact = false, eyebrow, id, state, title }: { children: ReactNode; compact?: boolean; eyebrow: string; id?: string; state: DataState; title: string }) {
  return (
    <section id={id} className={compact ? "" : "px-4 py-10 sm:px-6 lg:px-8"}>
      <div className={compact ? "" : "mx-auto max-w-7xl"}>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fish-gold">{eyebrow}</p>
            <h2 className={`mt-2 font-black text-white ${compact ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"}`}>{title}</h2>
          </div>
          <StatusBadge state={state} />
        </div>
        {children}
      </div>
    </section>
  );
}

function HeroCounter({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-fish-accent/25 bg-fish-navy950/70 p-5 shadow-harbor backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-fish-secondary">{label}</p>
        <Icon className="h-5 w-5 text-fish-accent" aria-hidden="true" />
      </div>
      <p className="mt-4 text-4xl font-black text-white">{value}</p>
    </div>
  );
}

function ProofTile({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-fish-accent/20 bg-fish-surface/80 p-5 shadow-harbor">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-fish-secondary">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm font-bold text-fish-secondary">{detail}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function MeaningRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-fish-secondary">{label}</p>
      <p className="mt-1 text-sm font-black leading-6 text-white">{value}</p>
    </div>
  );
}

function EmptyHarbor({ text }: { text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-fish-accent/25 bg-fish-surface/60 p-6 text-lg font-black leading-8 text-fish-primary">
      {text}
    </div>
  );
}

function statusClass(status: string) {
  if (status === "succeeded") {
    return "bg-emerald-400/15 text-emerald-200";
  }
  if (status === "untested") {
    return "bg-fish-accent/10 text-fish-secondary";
  }
  return "bg-red-500/15 text-red-100";
}

function sourceLabel(state: DataState) {
  if (state === "live") return "Live";
  if (state === "snapshot") return "Snapshot";
  if (state === "unavailable") return "Not ready";
  return "Sample";
}

function publicOceanBlocker(blocker: string) {
  if (blocker.includes("FISH_OCEAN_BATCH_ENDPOINT")) return "Connect Fish to the private Ocean batch kitchen.";
  if (blocker.includes("not reachable")) return "Bring the private Ocean batch kitchen online.";
  if (blocker.includes("not live-ready")) return "Finish the Ocean Node job settings in the private adapter.";
  if (blocker.includes("No successful non-sample Ocean batch receipt")) return "Run one successful Ocean dish and record its public-safe ticket.";
  return "Finish the next private Ocean proof setup step.";
}

function proofVerdict({
  hasLiveProof,
  oceanProof
}: {
  hasLiveProof: boolean;
  oceanProof: OceanProofReadiness;
}) {
  if (oceanProof.proof.hasNonSampleReceipt || oceanProof.trafficReady) {
    return {
      title: oceanProof.claim.title,
      boundary: oceanProof.claim.boundary
    };
  }

  if (hasLiveProof) {
    return {
      title: "Provider",
      boundary: "Fish has selected-provider proof tickets. Ocean batch proof still needs one successful non-sample dish."
    };
  }

  return {
    title: "Setup",
    boundary: "Fish is still in setup proof mode. Sample data and missing proof stay labeled until a real Ocean dish ticket exists."
  };
}

function proofBoundaryCards({ hasOceanBatchProof, oceanProof }: { hasOceanBatchProof: boolean; oceanProof: OceanProofReadiness }) {
  const readyTitle = hasOceanBatchProof ? oceanProof.claim.title : oceanProof.trafficReady ? "Ocean route connected" : "Setup mode";
  const readyBody = hasOceanBatchProof
    ? oceanProof.claim.boundary
    : oceanProof.trafficReady
      ? "Run one successful dish to record the first Ocean ticket."
      : "No Ocean workload claim yet.";

  return [
    {
      label: "Ready",
      title: readyTitle,
      body: readyBody,
      className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
    },
    {
      label: "Not claimed",
      title: "Paid external demand",
      body: "This needs one real external Ocean/Oncompute job and a public-safe receipt.",
      className: "border-fish-gold/25 bg-fish-gold/10 text-fish-primary"
    },
    {
      label: "Never public",
      title: "Raw orders and answers",
      body: "Proof shows ticket ids, hashes, usage, status, and timing only.",
      className: "border-fish-accent/20 bg-fish-surface/80 text-fish-secondary"
    }
  ];
}
