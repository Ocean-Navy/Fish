import { DashboardPreview } from "@/components/DashboardPreview";
import { FishUsageSummary } from "@/components/FishUsageSummary";
import { collectOceanData } from "@/lib/oceanSupply";
import { summarizeFishUsage } from "@/lib/fishLedger";
import { Fish } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ summary }, fishUsage] = await Promise.all([collectOceanData(), summarizeFishUsage()]);

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
      <DashboardPreview initialSummary={summary} />
      <FishUsageSummary summary={fishUsage} />
    </main>
  );
}
