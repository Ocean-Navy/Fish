import type { ChatCompletionInput } from "@/lib/fishLedger";

export type FishDishDefinition = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  routeLabel: string;
  lane: "warm" | "batch" | "future";
  short: string;
  placeholder: string;
  systemPrompt: string;
  userWrapper: (input: string) => string;
  maxTokens: number;
  modelAlias: string;
  enabled: boolean;
  oceanBatch?: {
    taskType: "document_summary" | "structured_extraction" | "embeddings" | "batch_chat";
    inputLabel: string;
    proofLabel: string;
    maxRuntimeSeconds: number;
    maxCostUsd: number;
  };
};

export type FishDishRunInput = {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
};

export const FISH_DISHES: FishDishDefinition[] = [
  {
    id: "ask",
    title: "Quick Catch",
    subtitle: "Simple answers",
    status: "AI beta",
    routeLabel: "Smart route",
    lane: "warm",
    short: "General questions with a short direct answer.",
    placeholder: "What should Fish do first for pilot users?",
    systemPrompt: "You are Fish Quick Catch. Answer plainly in a helpful, concise way. Avoid hype and label uncertainty.",
    userWrapper: (input) => `Answer this user question in a short, useful way:\n\n${input}`,
    maxTokens: 700,
    modelAlias: "fish-ask",
    enabled: true
  },
  {
    id: "code",
    title: "Code Roll",
    subtitle: "Coding help",
    status: "AI beta",
    routeLabel: "Smart route",
    lane: "warm",
    short: "Small coding help, review notes, and snippets.",
    placeholder: "Write a TypeScript helper that formats Fish credits.",
    systemPrompt: "You are Fish Code Roll. Give practical coding help with concise explanations and safe assumptions.",
    userWrapper: (input) => `Help with this coding task. Include code only when useful:\n\n${input}`,
    maxTokens: 1200,
    modelAlias: "fish-code",
    enabled: true
  },
  {
    id: "explain",
    title: "Clear Broth",
    subtitle: "Simple explanation",
    status: "AI beta",
    routeLabel: "Smart route",
    lane: "warm",
    short: "Simple explanations without heavy jargon.",
    placeholder: "Explain warm inference like I am new to AI.",
    systemPrompt: "You are Fish Clear Broth. Explain like a patient product guide. Use simple language and concrete examples.",
    userWrapper: (input) => `Explain this simply, with no marketing claims:\n\n${input}`,
    maxTokens: 700,
    modelAlias: "fish-clear-broth",
    enabled: true
  },
  {
    id: "docs",
    title: "Docs Bento",
    subtitle: "Summarize docs",
    status: "Ocean batch",
    routeLabel: "Batch kitchen",
    lane: "batch",
    short: "Turn long notes into a hash-only summary receipt.",
    placeholder: "Paste docs or notes for Fish to prepare a short summary.",
    systemPrompt: "You are Fish Docs Bento. Extract the main points, risks, and next step. Do not invent facts.",
    userWrapper: (input) => `Summarize this document text into bullets and one next step:\n\n${input}`,
    maxTokens: 900,
    modelAlias: "fish-docs",
    enabled: true,
    oceanBatch: {
      taskType: "document_summary",
      inputLabel: "Docs or notes",
      proofLabel: "Summary receipt",
      maxRuntimeSeconds: 600,
      maxCostUsd: 1
    }
  },
  {
    id: "repo",
    title: "Repo Roll",
    subtitle: "Map a codebase",
    status: "Ocean batch",
    routeLabel: "Batch kitchen",
    lane: "batch",
    short: "Find structure, risks, and next steps from repo notes.",
    placeholder: "Paste a repo URL, file list, diff, or README notes for Fish to map.",
    systemPrompt: "You are Fish Repo Roll. Map codebase structure, risks, and useful next steps. Be concrete and avoid unsupported claims.",
    userWrapper: (input) => `Prepare a compact codebase map with risks and next steps from this repo input:\n\n${input}`,
    maxTokens: 1000,
    modelAlias: "fish-repo",
    enabled: true,
    oceanBatch: {
      taskType: "structured_extraction",
      inputLabel: "Repo notes",
      proofLabel: "Repo map receipt",
      maxRuntimeSeconds: 900,
      maxCostUsd: 1.5
    }
  },
  {
    id: "eval",
    title: "Eval Platter",
    subtitle: "Score test prompts",
    status: "Ocean batch",
    routeLabel: "Batch kitchen",
    lane: "batch",
    short: "Run a small prompt set and return a scorecard receipt.",
    placeholder: "Paste 3-10 test prompts, expected traits, and the model answer set to score.",
    systemPrompt: "You are Fish Eval Platter. Create a simple evaluation scorecard from prompt tests. Flag uncertainty and missing evidence.",
    userWrapper: (input) => `Prepare a compact evaluation scorecard from this test set:\n\n${input}`,
    maxTokens: 1200,
    modelAlias: "fish-eval",
    enabled: true,
    oceanBatch: {
      taskType: "batch_chat",
      inputLabel: "Prompt tests",
      proofLabel: "Eval receipt",
      maxRuntimeSeconds: 1200,
      maxCostUsd: 2
    }
  },
  {
    id: "data",
    title: "Data Sushi",
    subtitle: "Make data searchable",
    status: "Ocean batch",
    routeLabel: "Batch kitchen",
    lane: "batch",
    short: "Prepare clean chunks or embeddings from pasted data notes.",
    placeholder: "Paste table notes, rows, or a dataset reference for Fish to prepare.",
    systemPrompt: "You are Fish Data Sushi. Turn messy data notes into clean chunks, fields, and search-ready structure. Do not expose private data.",
    userWrapper: (input) => `Prepare search-ready data chunks and field notes from this input:\n\n${input}`,
    maxTokens: 900,
    modelAlias: "fish-data",
    enabled: true,
    oceanBatch: {
      taskType: "embeddings",
      inputLabel: "Data notes",
      proofLabel: "Data prep receipt",
      maxRuntimeSeconds: 900,
      maxCostUsd: 1.25
    }
  },
  {
    id: "images",
    title: "Image Catch",
    subtitle: "Create images",
    status: "Coming soon",
    routeLabel: "Paid beta later",
    lane: "future",
    short: "Image generation starts external first and moves Ocean-native later.",
    placeholder: "Describe an image of the Fish meal counter.",
    systemPrompt: "Image generation is not enabled yet.",
    userWrapper: (input) => input,
    maxTokens: 1,
    modelAlias: "fish-images",
    enabled: false
  },
  {
    id: "proposal",
    title: "Proposal Platter",
    subtitle: "Draft from notes",
    status: "Beta",
    routeLabel: "Draft helper",
    lane: "warm",
    short: "Make a short pilot proposal from rough notes.",
    placeholder: "Draft a small proposal for a Fish warm inference demo node.",
    systemPrompt: "You are Fish Proposal Platter. Produce a practical proposal with scope, benefits, limits, and next steps.",
    userWrapper: (input) => `Turn these notes into a short proposal. Keep it honest and implementation-oriented:\n\n${input}`,
    maxTokens: 900,
    modelAlias: "fish-proposal",
    enabled: true
  },
  {
    id: "ocean",
    title: "Ocean Special",
    subtitle: "Fish and Ocean context",
    status: "Ocean guide",
    routeLabel: "Smart route",
    lane: "warm",
    short: "Fish and Ocean wording for non-technical users.",
    placeholder: "How should we describe Ocean-first routing on the site?",
    systemPrompt:
      "You are Fish Ocean Special. Help explain Fish, Ocean Network, Oncompute, credits, and provider routing. Never claim full decentralization, live payouts, unlimited free AI, or staking yield.",
    userWrapper: (input) => `Answer using Fish/Ocean context and clear caveats where needed:\n\n${input}`,
    maxTokens: 700,
    modelAlias: "fish-ocean-helper",
    enabled: true
  }
];

export function getFishDish(dishId: string) {
  const normalized = dishId.trim().toLowerCase();
  return FISH_DISHES.find((dish) => dish.id === normalized || dish.title.toLowerCase().replaceAll(" ", "-") === normalized) ?? null;
}

export function publicFishDish(dish: FishDishDefinition) {
  return {
    id: dish.id,
    title: dish.title,
    subtitle: dish.subtitle,
    status: dish.status,
    routeLabel: dish.routeLabel,
    lane: dish.lane,
    short: dish.short,
    placeholder: dish.placeholder,
    maxTokens: dish.maxTokens,
    modelAlias: dish.modelAlias,
    enabled: dish.enabled,
    oceanBatch: dish.oceanBatch
  };
}

export function buildFishDishChatInput(dish: FishDishDefinition, input: FishDishRunInput, routeLabel: string, maxOutputTokens: number): ChatCompletionInput {
  const requestedMaxTokens = input.maxTokens ?? dish.maxTokens;
  const maxTokens = Math.max(1, Math.min(dish.maxTokens, requestedMaxTokens, maxOutputTokens));
  return {
    model: input.model?.trim() || dish.modelAlias,
    stream: input.stream ?? false,
    temperature: input.temperature,
    max_tokens: maxTokens,
    metadata: {
      ...(input.metadata ?? {}),
      fish_feature: dish.id,
      fish_dish: dish.title,
      fish_dish_id: dish.id
    },
    messages: [
      {
        role: "system",
        content: `${dish.systemPrompt}\n\nFish dish: ${dish.title}. Plain task label: ${dish.subtitle}. Public status label: ${dish.status}. Route label shown to the user: ${routeLabel}.`
      },
      {
        role: "user",
        content: dish.userWrapper(input.prompt)
      }
    ]
  };
}
