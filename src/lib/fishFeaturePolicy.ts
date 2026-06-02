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
  modelAliases: string[];
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
  modelAliases?: string[];
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
    defaultMaxOutputTokens: 700,
    aliases: ["quick-catch"],
    modelAliases: ["fish-ask", "fish-quick-catch"]
  },
  {
    id: "code",
    label: "Code",
    state: "beta",
    primary: "Ocean demo vLLM",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 4000,
    defaultMaxOutputTokens: 1200,
    aliases: ["code-roll"],
    modelAliases: ["fish-code", "fish-code-roll"]
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
    aliases: ["clear-broth", "clear_broth"],
    modelAliases: ["fish-clear-broth", "fish-explain"]
  },
  {
    id: "docs",
    label: "Docs",
    state: "beta",
    primary: "Ocean batch / Oncompute",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 4000,
    defaultMaxOutputTokens: 900,
    aliases: ["docs-bento"],
    modelAliases: ["fish-docs", "fish-docs-bento"]
  },
  {
    id: "images",
    label: "Images",
    state: "coming-soon",
    primary: "External paid beta first",
    fallback: "Ocean-native later",
    enabled: false,
    defaultMaxInputTokens: 500,
    defaultMaxOutputTokens: 1,
    aliases: ["image-catch"],
    modelAliases: ["fish-images", "fish-image-catch"]
  },
  {
    id: "proposal",
    label: "Proposal",
    state: "beta",
    primary: "Ocean demo vLLM",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 3000,
    defaultMaxOutputTokens: 900,
    aliases: ["proposal-platter"],
    modelAliases: ["fish-proposal", "fish-proposal-platter"]
  },
  {
    id: "ocean",
    label: "Ocean helper",
    state: "beta",
    primary: "Ocean demo vLLM plus Fish/Ocean context",
    fallback: "Paid fallback only when enabled",
    enabled: true,
    defaultMaxInputTokens: 2000,
    defaultMaxOutputTokens: 700,
    aliases: ["ocean-helper", "ocean_helper", "ocean-special"],
    modelAliases: ["fish-ocean-helper", "fish-ocean-special"]
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

export const FISH_DISH_MODELS = FEATURE_DEFINITIONS.flatMap((definition) => {
  if (!definition.enabled || definition.id === "api" || !definition.modelAliases?.length) {
    return [];
  }
  return [
    {
      id: definition.modelAliases[0],
      object: "model",
      created: 1780245000,
      owned_by: "ocean-navy",
      description: `${definition.label} dish alias for the Fish API.`,
      fishFeature: definition.id,
      featureLabel: definition.label,
      state: definition.state
    }
  ];
});

export function getFishFeaturePolicy(metadata: Record<string, unknown> | undefined, routerConfig: FishRouterConfig, model?: string) {
  const id = readFishFeatureId(metadata, model) ?? "api";
  return getFishFeaturePolicyById(id, routerConfig);
}

export function listFishFeaturePolicies(routerConfig: FishRouterConfig) {
  return FEATURE_DEFINITIONS.map((definition) => buildPolicy(definition, routerConfig));
}

export function fishFeatureIdFromModel(model: string | undefined) {
  return findFeatureDefinition(model)?.id ?? null;
}

function getFishFeaturePolicyById(id: FishFeatureId, routerConfig: FishRouterConfig) {
  return buildPolicy(FEATURE_DEFINITIONS.find((definition) => definition.id === id) ?? FEATURE_DEFINITIONS.at(-1)!, routerConfig);
}

function readFishFeatureId(metadata: Record<string, unknown> | undefined, model?: string): FishFeatureId | null {
  const raw = metadata?.fish_feature ?? metadata?.feature ?? metadata?.fish_dish;
  if (typeof raw !== "string") {
    return fishFeatureIdFromModel(model);
  }
  const metadataFeature = findFeatureDefinition(raw)?.id ?? null;
  return metadataFeature ?? fishFeatureIdFromModel(model);
}

function findFeatureDefinition(value: string | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
  if (!normalized) {
    return null;
  }
  for (const definition of FEATURE_DEFINITIONS) {
    const label = definition.label.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
    if (definition.id === normalized || label === normalized || definition.aliases?.includes(normalized) || definition.modelAliases?.includes(normalized)) {
      return definition;
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
    primary: featurePrimary(definition, routerConfig),
    fallback: featureFallback(definition, routerConfig),
    enabled: definition.enabled,
    maxInputTokens,
    maxOutputTokens,
    cap: definition.enabled ? `${maxInputTokens} in / ${maxOutputTokens} out` : "Disabled in V0",
    modelAliases: definition.modelAliases ?? []
  };
}

function featurePrimary(definition: FishFeatureDefinition, routerConfig: FishRouterConfig) {
  if (!definition.enabled || definition.id === "api" || definition.id === "docs") {
    return definition.primary;
  }
  const activeRoute = routerConfig.routes[routerConfig.activeRouteId];
  return activeRoute.isRealAi && activeRoute.configured ? activeRoute.publicLabel : definition.primary;
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
  const activeRoute = routerConfig.routes[routerConfig.activeRouteId];
  return activeRoute.isRealAi && activeRoute.configured ? "live-beta" : fallback;
}

function readFeatureLimit(featureId: FishFeatureId, kind: "INPUT" | "OUTPUT", fallback: number) {
  const key = `FISH_${featureId.toUpperCase().replaceAll("-", "_")}_MAX_${kind}_TOKENS`;
  const parsed = Number(process.env[key]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
