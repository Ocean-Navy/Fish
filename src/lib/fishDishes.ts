import type { ChatCompletionInput } from "@/lib/fishLedger";

export type FishDishDefinition = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  routeLabel: string;
  short: string;
  placeholder: string;
  systemPrompt: string;
  userWrapper: (input: string) => string;
  maxTokens: number;
  modelAlias: string;
  enabled: boolean;
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
    status: "Beta",
    routeLabel: "Text + batch",
    short: "Summaries now, plus hash-only batch receipts with a key.",
    placeholder: "Paste docs or notes to summarize for a pilot update.",
    systemPrompt: "You are Fish Docs Bento. Extract the main points, risks, and next step. Do not invent facts.",
    userWrapper: (input) => `Summarize this document text into bullets and one next step:\n\n${input}`,
    maxTokens: 900,
    modelAlias: "fish-docs",
    enabled: true
  },
  {
    id: "images",
    title: "Image Catch",
    subtitle: "Create images",
    status: "Coming soon",
    routeLabel: "Paid beta later",
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
    short: dish.short,
    placeholder: dish.placeholder,
    maxTokens: dish.maxTokens,
    modelAlias: dish.modelAlias,
    enabled: dish.enabled
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
