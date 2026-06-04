import { NextResponse } from "next/server";
import { summarizeFishContracts } from "@/lib/fishContracts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await summarizeFishContracts());
}
