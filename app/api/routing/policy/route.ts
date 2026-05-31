import { NextResponse } from "next/server";
import { getFishRoutePolicy } from "@/lib/routePolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getFishRoutePolicy());
}
