import { getExternalChatConfig, isExternalChatEnabled } from "@/lib/externalChat";
import type { DataState } from "@/lib/types";

export type RouteModeId = "mock" | "external-fallback" | "selected-ocean-provider" | "ocean-private" | "hardened-runner" | "tee-runner";
export type RouteModeState = "active" | "ready" | "needs-config" | "pilot" | "future";

export type FishRoutePolicy = {
  dataState: DataState;
  generatedAt: string;
  activeRoute: {
    id: "mock" | "external-fallback";
    label: string;
    isRealAi: boolean;
    privacy: string;
    evidence: string;
  };
  backend: {
    chatBackend: "mock" | "external";
    externalConfigured: boolean;
    externalBaseUrlConfigured: boolean;
    externalApiKeyConfigured: boolean;
    externalModel: string | null;
    externalProviderId: string;
  };
  modes: Array<{
    id: RouteModeId;
    title: string;
    state: RouteModeState;
    short: string;
    privacy: string;
    proof: string;
  }>;
  rules: Array<{
    title: string;
    body: string;
  }>;
  nextMilestone: string;
};

export function getFishRoutePolicy(): FishRoutePolicy {
  const externalConfig = getExternalChatConfig();
  const externalConfigured = isExternalChatEnabled(externalConfig);
  const activeRoute = externalConfigured
    ? {
        id: "external-fallback" as const,
        label: "Outside AI route",
        isRealAi: true,
        privacy: "Prompts go to the configured outside AI provider. Fish keeps usage numbers and a request hash.",
        evidence: "Marked as outside AI, not Ocean provider proof."
      }
    : {
        id: "mock" as const,
        label: "Demo mode",
        isRealAi: false,
        privacy: "Demo answers stay inside the local app process.",
        evidence: "Marked as a demo estimate so nobody confuses it with provider work."
      };

  return {
    dataState: "live",
    generatedAt: new Date().toISOString(),
    activeRoute,
    backend: {
      chatBackend: externalConfig.backend,
      externalConfigured,
      externalBaseUrlConfigured: Boolean(externalConfig.baseUrl),
      externalApiKeyConfigured: Boolean(externalConfig.apiKey),
      externalModel: externalConfig.model,
      externalProviderId: externalConfig.providerId
    },
    modes: [
      {
        id: "mock",
        title: "Demo answer",
        state: activeRoute.id === "mock" ? "active" : "ready",
        short: "Local answer for the first version.",
        privacy: "No outside provider is called.",
        proof: "Demo usage record."
      },
      {
        id: "external-fallback",
        title: "Outside AI",
        state: externalConfigured ? "active" : "needs-config",
        short: "Real AI through an outside provider.",
        privacy: "Outside provider policy applies.",
        proof: "Outside AI usage record."
      },
      {
        id: "selected-ocean-provider",
        title: "Ocean providers",
        state: "pilot",
        short: "Selected Ocean providers run jobs.",
        privacy: "Provider terms and Fish routing policy apply.",
        proof: "Signed provider proof."
      },
      {
        id: "ocean-private",
        title: "Private Ocean lane",
        state: "future",
        short: "Ocean provider with reviewed privacy rules.",
        privacy: "Provider commits to no prompt/output retention.",
        proof: "Policy review plus usage records."
      },
      {
        id: "hardened-runner",
        title: "Stronger runner",
        state: "future",
        short: "Controlled runner with tighter isolation.",
        privacy: "Runner-level storage and access controls.",
        proof: "Runner logs without raw prompt text."
      },
      {
        id: "tee-runner",
        title: "Hardware proof",
        state: "future",
        short: "Hardware-backed route much later.",
        privacy: "Hardware-backed execution boundary.",
        proof: "Hardware proof plus provider proof."
      }
    ],
    rules: [
      {
        title: "Name the route",
        body: "Demo, outside AI, and Ocean provider work must be labeled differently."
      },
      {
        title: "No fake Ocean",
        body: "Fish must not claim Ocean routing until selected providers run jobs."
      },
      {
        title: "Usage stays clean",
        body: "Usage records keep hashes, costs, and provider ids, not raw prompts or outputs."
      },
      {
        title: "Privacy is explicit",
        body: "Outside AI can help launch, but that provider's privacy policy applies."
      }
    ],
    nextMilestone: "Connect selected Ocean provider jobs to the chat/API route behind an allowlist and public-safe proof."
  };
}
