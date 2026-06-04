import type { FishChatRouteId } from "@/lib/fishRouter";

const PRIVACY_MODES = ["local_demo", "external_policy", "ocean_demo_policy", "selected_ocean_policy", "hash_only_batch", "ocean_hardened", "ocean_tee", "e2ee_to_tee"] as const;
const RAW_PROMPT_DESTINATIONS = ["local_process", "external_provider", "ocean_demo_provider", "selected_ocean_provider", "hash_only_batch_adapter"] as const;

export type FishPrivacyMode = (typeof PRIVACY_MODES)[number];
export type FishRawPromptDestination = (typeof RAW_PROMPT_DESTINATIONS)[number];
export type FishPrivacyRoute = FishChatRouteId | "ocean-batch";

export type FishPrivacyPreference =
  | {
      ok: true;
      requestedPrivacyMode: FishPrivacyMode | null;
      allowPrivacyDowngrade: boolean;
    }
  | {
      ok: false;
      error: "invalid_privacy_mode";
      requestedPrivacyMode: string;
    };

export type FishUsagePrivacy = {
  requestedPrivacyMode: FishPrivacyMode | null;
  acceptedPrivacyMode: FishPrivacyMode;
  privacyDowngradeReason: string | null;
  rawPromptSentTo: FishRawPromptDestination;
  storesPromptText: false;
  storesOutputText: false;
};

export type FishPrivacyDecision =
  | {
      ok: true;
      privacy: FishUsagePrivacy;
    }
  | {
      ok: false;
      status: 403;
      error: "privacy_mode_unavailable";
      requestedPrivacyMode: FishPrivacyMode;
      acceptedPrivacyMode: FishPrivacyMode;
      rawPromptSentTo: FishRawPromptDestination;
    };

export function readFishPrivacyPreference(metadata: Record<string, unknown> | undefined): FishPrivacyPreference {
  const raw = readMetadataString(metadata, ["requestedPrivacyMode", "requested_privacy_mode", "fish_privacy_mode", "fishPrivacyMode"]);
  const allowPrivacyDowngrade = readMetadataBoolean(metadata, ["allowPrivacyDowngrade", "allow_privacy_downgrade", "fish_allow_privacy_downgrade"]);
  if (!raw) {
    return {
      ok: true,
      requestedPrivacyMode: null,
      allowPrivacyDowngrade
    };
  }

  const requestedPrivacyMode = normalizePrivacyMode(raw);
  if (!requestedPrivacyMode) {
    return {
      ok: false,
      error: "invalid_privacy_mode",
      requestedPrivacyMode: raw
    };
  }

  return {
    ok: true,
    requestedPrivacyMode,
    allowPrivacyDowngrade
  };
}

export function resolveFishPrivacy(params: { route: FishPrivacyRoute; requestedPrivacyMode?: FishPrivacyMode | null; allowPrivacyDowngrade?: boolean }): FishPrivacyDecision {
  const acceptedPrivacyMode = acceptedPrivacyModeForRoute(params.route);
  const rawPromptSentTo = rawPromptDestinationForRoute(params.route);
  const requestedPrivacyMode = params.requestedPrivacyMode ?? null;
  const satisfied = !requestedPrivacyMode || privacyModeSatisfies(acceptedPrivacyMode, requestedPrivacyMode);
  if (!satisfied && !params.allowPrivacyDowngrade) {
    return {
      ok: false,
      status: 403,
      error: "privacy_mode_unavailable",
      requestedPrivacyMode,
      acceptedPrivacyMode,
      rawPromptSentTo
    };
  }

  return {
    ok: true,
    privacy: {
      requestedPrivacyMode,
      acceptedPrivacyMode,
      privacyDowngradeReason: requestedPrivacyMode && !satisfied ? "requested_privacy_mode_unavailable_for_route" : null,
      rawPromptSentTo,
      storesPromptText: false,
      storesOutputText: false
    }
  };
}

export function defaultFishPrivacyForRoute(route: FishPrivacyRoute): FishUsagePrivacy {
  const decision = resolveFishPrivacy({ route });
  return decision.ok
    ? decision.privacy
    : {
        requestedPrivacyMode: null,
        acceptedPrivacyMode: "local_demo",
        privacyDowngradeReason: null,
        rawPromptSentTo: "local_process",
        storesPromptText: false,
        storesOutputText: false
      };
}

function acceptedPrivacyModeForRoute(route: FishPrivacyRoute): FishPrivacyMode {
  if (route === "mock") {
    return "local_demo";
  }
  if (route === "external-fallback") {
    return "external_policy";
  }
  if (route === "ocean-demo-vllm") {
    return "ocean_demo_policy";
  }
  if (route === "ocean-batch") {
    return "hash_only_batch";
  }
  return "selected_ocean_policy";
}

function rawPromptDestinationForRoute(route: FishPrivacyRoute): FishRawPromptDestination {
  if (route === "mock") {
    return "local_process";
  }
  if (route === "external-fallback") {
    return "external_provider";
  }
  if (route === "ocean-demo-vllm") {
    return "ocean_demo_provider";
  }
  if (route === "ocean-batch") {
    return "hash_only_batch_adapter";
  }
  return "selected_ocean_provider";
}

function privacyModeSatisfies(accepted: FishPrivacyMode, requested: FishPrivacyMode) {
  if (accepted === requested) {
    return true;
  }
  if (requested === "external_policy") {
    return true;
  }
  if (requested === "ocean_demo_policy") {
    return accepted === "selected_ocean_policy" || accepted === "hash_only_batch" || accepted === "ocean_hardened" || accepted === "ocean_tee" || accepted === "e2ee_to_tee";
  }
  if (requested === "selected_ocean_policy") {
    return accepted === "hash_only_batch" || accepted === "ocean_hardened" || accepted === "ocean_tee" || accepted === "e2ee_to_tee";
  }
  if (requested === "hash_only_batch") {
    return false;
  }
  if (requested === "ocean_hardened") {
    return accepted === "ocean_tee" || accepted === "e2ee_to_tee";
  }
  if (requested === "ocean_tee") {
    return accepted === "e2ee_to_tee";
  }
  return false;
}

function normalizePrivacyMode(value: string): FishPrivacyMode | null {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const aliases: Record<string, FishPrivacyMode> = {
    local: "local_demo",
    local_demo: "local_demo",
    demo: "local_demo",
    mock: "local_demo",
    external: "external_policy",
    external_policy: "external_policy",
    outside_ai: "external_policy",
    ocean_demo: "ocean_demo_policy",
    ocean_demo_policy: "ocean_demo_policy",
    ocean_private: "selected_ocean_policy",
    ocean_private_policy: "selected_ocean_policy",
    selected_ocean: "selected_ocean_policy",
    selected_ocean_policy: "selected_ocean_policy",
    hash_only: "hash_only_batch",
    hash_only_batch: "hash_only_batch",
    ocean_batch: "hash_only_batch",
    hardened: "ocean_hardened",
    ocean_hardened: "ocean_hardened",
    tee: "ocean_tee",
    ocean_tee: "ocean_tee",
    e2ee: "e2ee_to_tee",
    e2ee_to_tee: "e2ee_to_tee"
  };
  return aliases[normalized] ?? null;
}

function readMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  if (!metadata) {
    return null;
  }
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readMetadataBoolean(metadata: Record<string, unknown> | undefined, keys: string[]) {
  if (!metadata) {
    return false;
  }
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no"].includes(normalized)) {
        return false;
      }
    }
  }
  return false;
}
