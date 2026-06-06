import { NextResponse } from "next/server";
import { summarizeBillingReadiness } from "@/lib/fishPayments";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(summarizeBillingReadiness());
}
