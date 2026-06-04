import { BenchmarkMatrixPanel } from "@/components/BenchmarkMatrixPanel";
import { ContractUtilityPanel } from "@/components/ContractUtilityPanel";
import { DashboardPreview } from "@/components/DashboardPreview";
import { FishUsageSummary } from "@/components/FishUsageSummary";
import { MarketMakingPanel } from "@/components/MarketMakingPanel";
import { ProofSummaryPanel } from "@/components/ProofSummaryPanel";
import { ProviderBondsPanel } from "@/components/ProviderBondsPanel";
import { ProviderPilotPanel } from "@/components/ProviderPilotPanel";
import { ProviderScorecardPanel } from "@/components/ProviderScorecardPanel";
import { StakingCreditsPanel } from "@/components/StakingCreditsPanel";
import { WarmInferenceStatusPanel } from "@/components/WarmInferenceStatusPanel";
import { collectOceanData } from "@/lib/oceanSupply";
import { summarizeCapacitySettlements } from "@/lib/capacitySettlements";
import { summarizeFishUsage } from "@/lib/fishLedger";
import { summarizeFishContracts } from "@/lib/fishContracts";
import { summarizeMarketMaking } from "@/lib/marketMaking";
import { summarizeBenchmarks } from "@/lib/providerBenchmarks";
import { summarizeProviderBonds } from "@/lib/providerBonds";
import { summarizeProof } from "@/lib/providerJobs";
import { collectProviderPilotRegistry } from "@/lib/providerPilot";
import { summarizeProviderScorecard } from "@/lib/providerScorecard";
import { summarizeStakingCredits } from "@/lib/stakingCredits";
import { getWarmInferenceStatus } from "@/lib/warmInferenceStatus";
import { Fish } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [oceanData, fishUsage, providerPilot, proof, providerScorecard, providerBonds, benchmarks, stakingCredits, warmStatus, contractStatus, capacitySettlements] = await Promise.all([
    collectOceanData(),
    summarizeFishUsage(),
    collectProviderPilotRegistry(),
    summarizeProof(),
    summarizeProviderScorecard(),
    summarizeProviderBonds(),
    summarizeBenchmarks(),
    summarizeStakingCredits(),
    getWarmInferenceStatus(),
    summarizeFishContracts(),
    summarizeCapacitySettlements()
  ]);
  const marketMaking = await summarizeMarketMaking({
    oceanSummary: oceanData.summary,
    fishUsage,
    scorecard: providerScorecard,
    benchmarks
  });

  return (
    <main className="min-h-screen">
      <header className="border-b border-fish-accent/15 bg-fish-navy950/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-white">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-fish-accent/35 bg-fish-accent/15 text-fish-accent">
              <Fish className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-black">Fish</span>
          </Link>
          <Link className="rounded-full border border-fish-accent/40 px-4 py-2 text-sm font-black text-fish-accent" href="/#pilot">
            Join pilot
          </Link>
        </div>
      </header>
      <DashboardPreview initialSummary={oceanData.summary} />
      <FishUsageSummary summary={fishUsage} />
      <WarmInferenceStatusPanel status={warmStatus} />
      <StakingCreditsPanel summary={stakingCredits} />
      <ContractUtilityPanel contractStatus={contractStatus} capacitySettlements={capacitySettlements} />
      <ProviderPilotPanel registry={providerPilot} />
      <ProviderScorecardPanel summary={providerScorecard} />
      <ProviderBondsPanel summary={providerBonds} />
      <MarketMakingPanel summary={marketMaking} />
      <ProofSummaryPanel summary={proof} />
      <BenchmarkMatrixPanel summary={benchmarks} />
    </main>
  );
}
