import { NextResponse } from "next/server";
import { collectProviderPilotRegistry, isProviderAllowed } from "@/lib/providerPilot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const registry = await collectProviderPilotRegistry();
  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const workloadType = url.searchParams.get("workloadType") ?? "chat_batch";
  const model = url.searchParams.get("model") ?? "fish-demo-chat";

  return NextResponse.json({
    ...registry,
    allowedFor:
      providerId === null
        ? null
        : {
            providerId,
            workloadType,
            model,
            allowed: isProviderAllowed(registry, providerId, workloadType, model)
          }
  });
}
