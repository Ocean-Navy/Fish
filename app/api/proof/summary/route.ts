import { NextResponse } from "next/server";
import { summarizeCapacitySettlements } from "@/lib/capacitySettlements";
import { summarizeProof } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function GET() {
  const [proof, capacitySettlements] = await Promise.all([summarizeProof(), summarizeCapacitySettlements()]);
  return NextResponse.json({ ...proof, capacitySettlements });
}
