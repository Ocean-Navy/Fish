import { NextResponse } from "next/server";
import { listProviderJobReceipts } from "@/lib/providerJobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProviderJobReceipts());
}
