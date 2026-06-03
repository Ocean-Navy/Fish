import type { Metadata } from "next";
import { PublicProofPage } from "@/components/PublicProofPage";
import { summarizeOceanBatchJobs } from "@/lib/oceanBatch";
import { summarizeOceanProofReadiness } from "@/lib/oceanProofReadiness";
import { summarizeBenchmarks } from "@/lib/providerBenchmarks";
import { summarizeProof } from "@/lib/providerJobs";
import { summarizeProviderScorecard } from "@/lib/providerScorecard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fish Proof Harbor",
  description: "A simple public proof page for Fish pilot activity, provider runs, payouts, and route tests."
};

export default async function ProofPage() {
  const [proof, scorecard, benchmarks, batch, oceanProof] = await Promise.all([summarizeProof(), summarizeProviderScorecard(), summarizeBenchmarks(), summarizeOceanBatchJobs(), summarizeOceanProofReadiness()]);
  return <PublicProofPage proof={proof} scorecard={scorecard} benchmarks={benchmarks} batch={batch} oceanProof={oceanProof} />;
}
