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
        label: "External fallback",
        isRealAi: true,
        privacy: "Prompts go to the configured compatible backend. Fish receipts keep only usage numbers and a request hash.",
        evidence: "Receipts are marked fallback_verified, not Ocean provider proof."
      }
    : {
        id: "mock" as const,
        label: "Mock market demo",
        isRealAi: false,
        privacy: "Prompts stay inside the local app process for deterministic demo answers.",
        evidence: "Receipts are marked prototype_estimate so nobody confuses them with real provider work."
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
        title: "Market Demo",
        state: activeRoute.id === "mock" ? "active" : "ready",
        short: "Safe toy catch for V0.",
        privacy: "Local deterministic answer.",
        proof: "Prototype estimate receipt."
      },
      {
        id: "external-fallback",
        title: "Guest Kitchen",
        state: externalConfigured ? "active" : "needs-config",
        short: "Real AI through a compatible backend.",
        privacy: "External backend policy applies.",
        proof: "Fallback verified receipt."
      },
      {
        id: "selected-ocean-provider",
        title: "Ocean Dock",
        state: "pilot",
        short: "Selected Ocean providers run jobs.",
        privacy: "Provider terms and Fish routing policy apply.",
        proof: "Signed provider receipt."
      },
      {
        id: "ocean-private",
        title: "Quiet Cabin",
        state: "future",
        short: "No-log Ocean provider lane.",
        privacy: "Provider commits to no prompt/output retention.",
        proof: "Policy attestation plus receipts."
      },
      {
        id: "hardened-runner",
        title: "Locked Galley",
        state: "future",
        short: "Controlled runner with tighter isolation.",
        privacy: "Runner-level storage and access controls.",
        proof: "Runner logs without raw prompt text."
      },
      {
        id: "tee-runner",
        title: "Sealed Chest",
        state: "future",
        short: "TEE-backed route much later.",
        privacy: "Attested execution boundary.",
        proof: "Attestation plus provider receipt."
      }
    ],
    rules: [
      {
        title: "Name the route",
        body: "Mock, fallback, and Ocean provider work must be labeled differently."
      },
      {
        title: "No fake Ocean",
        body: "Fish must not claim Ocean routing until selected providers run jobs."
      },
      {
        title: "Receipts stay clean",
        body: "Usage receipts keep hashes, tokens, costs, and provider ids, not raw prompts or outputs."
      },
      {
        title: "Privacy is explicit",
        body: "External fallback is useful for launch, but its provider privacy policy applies."
      }
    ],
    nextMilestone: "Connect selected Ocean provider jobs to the chat/API route behind an allowlist and public-safe receipts."
  };
}
