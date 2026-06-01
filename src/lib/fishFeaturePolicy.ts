import type { FishRouterConfig } from "@/lib/fishRouter";

export type FishFeatureId = "ask" | "code" | "explain" | "docs" | "images" | "proposal" | "ocean" | "api";
export type FishFeatureState = "live-beta" | "beta" | "coming-soon";

export type FishFeaturePolicy = {
  id: FishFeatureId;
  label: string;
  state: FishFeatureState;
  primary: string;
  fallback: string;
  enabled: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  cap: string;
};

type FishFeatureDefinition = {
  id: FishFeatureId;
  label: string;
  state: FishFeatureState;
  primary: string;
  fallback: string;
  enabled: boolean;
  defaultMaxInputTokens: number;
  defaultMaxOutputTokens: number;
  aliases?: string[];
};

const FEATURE_DEFINITIONS: FishFeatureDefinition[] = [
  {
    id: "ask",
    label: "Ask",
    state: "beta",
    primary: "Ocean demo vLLM",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 2000,
    defaultMaxOutputTokens: 700
  },
  {
    id: "code",
    label: "Code",
    state: "beta",
    primary: "Ocean demo vLLM",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 4000,
    defaultMaxOutputTokens: 1200
  },
  {
    id: "explain",
    label: "Clear Broth",
    state: "beta",
    primary: "Ocean demo vLLM",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 2000,
    defaultMaxOutputTokens: 700,
    aliases: ["clear-broth", "clear_broth"]
  },
  {
    id: "docs",
    label: "Docs",
    state: "beta",
    primary: "Text route now, Ocean batch later",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 4000,
    defaultMaxOutputTokens: 900
  },
  {
    id: "images",
    label: "Images",
    state: "coming-soon",
    primary: "External paid beta first",
    fallback: "Ocean-native later",
    enabled: false,
    defaultMaxInputTokens: 500,
    defaultMaxOutputTokens: 1
  },
  {
    id: "proposal",
    label: "Proposal",
    state: "beta",
    primary: "Ocean demo vLLM",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 3000,
    defaultMaxOutputTokens: 900
  },
  {
    id: "ocean",
    label: "Ocean helper",
    state: "beta",
    primary: "Ocean demo vLLM plus Fish/Ocean prompt",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 2000,
    defaultMaxOutputTokens: 700,
    aliases: ["ocean-helper", "ocean_helper"]
  },
  {
    id: "api",
    label: "API",
    state: "beta",
    primary: "Fish Gateway",
    fallback: "Route policy decides",
    enabled: true,
    defaultMaxInputTokens: 2000,
    defaultMaxOutputTokens: 700
  }
];

export function getFishFeaturePolicy(metadata: Record<string, unknown> | undefined, routerConfig: FishRouterConfig) {
  const id = readFishFeatureId(metadata) ?? "api";
  return getFishFeaturePolicyById(id, routerConfig);
}

export function listFishFeaturePolicies(routerConfig: FishRouterConfig) {
  return FEATURE_DEFINITIONS.map((definition) => buildPolicy(definition, routerConfig));
}

function getFishFeaturePolicyById(id: FishFeatureId, routerConfig: FishRouterConfig) {
  return buildPolicy(FEATURE_DEFINITIONS.find((definition) => definition.id === id) ?? FEATURE_DEFINITIONS.at(-1)!, routerConfig);
}

function readFishFeatureId(metadata: Record<string, unknown> | undefined): FishFeatureId | null {
  const raw = metadata?.fish_feature ?? metadata?.feature ?? metadata?.fish_dish;
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replaceAll(" ", "-");
  for (const definition of FEATURE_DEFINITIONS) {
    if (definition.id === normalized || definition.aliases?.includes(normalized)) {
      return definition.id;
    }
  }
  return null;
}

function buildPolicy(definition: FishFeatureDefinition, routerConfig: FishRouterConfig): FishFeaturePolicy {
  const maxInputTokens = Math.min(routerConfig.guardrails.maxInputTokens, readFeatureLimit(definition.id, "INPUT", definition.defaultMaxInputTokens));
  const maxOutputTokens = Math.min(routerConfig.guardrails.maxOutputTokens, readFeatureLimit(definition.id, "OUTPUT", definition.defaultMaxOutputTokens));
  const state = definition.id === "ask" || definition.id === "code" ? liveTextState(definition.state, routerConfig) : definition.state;
  return {
    id: definition.id,
    label: definition.label,
    state,
    primary: definition.primary,
    fallback: featureFallback(definition, routerConfig),
    enabled: definition.enabled,
    maxInputTokens,
    maxOutputTokens,
    cap: definition.enabled ? `${maxInputTokens} in / ${maxOutputTokens} out` : "Disabled in V0"
  };
}

function featureFallback(definition: FishFeatureDefinition, routerConfig: FishRouterConfig) {
  if (!definition.enabled) {
    return definition.fallback;
  }
  if (definition.id === "api") {
    return definition.fallback;
  }
  if (!routerConfig.routes["external-fallback"].configured) {
    return "No fallback configured";
  }
  return routerConfig.guardrails.externalFallbackFreeAllowed ? "Outside AI fallback allowed" : definition.fallback;
}

function liveTextState(fallback: FishFeatureState, routerConfig: FishRouterConfig): FishFeatureState {
  return routerConfig.routes["ocean-demo-vllm"].configured ? "live-beta" : fallback;
}

function readFeatureLimit(featureId: FishFeatureId, kind: "INPUT" | "OUTPUT", fallback: number) {
  const key = `FISH_${featureId.toUpperCase().replaceAll("-", "_")}_MAX_${kind}_TOKENS`;
  const parsed = Number(process.env[key]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
