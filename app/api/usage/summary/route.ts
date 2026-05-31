import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    dataState: "sample",
    requests: 0,
    oceanNativeJobs: 0,
    providerPayoutUsd: 0,
    creditsSpent: 0,
    message: "Usage metrics start after the Fish API prototype is live."
  });
}
