export type FishKnowledgeSource = {
  id: string;
  title: string;
  source: string;
};

type FishKnowledgeSnippet = FishKnowledgeSource & {
  keywords: string[];
  body: string;
};

const FISH_KNOWLEDGE_SNIPPETS: FishKnowledgeSnippet[] = [
  {
    id: "fish-product-loop",
    title: "Fish product loop",
    source: "fish_simple_venice_like_product_spec_with_ocean_nodes.md",
    keywords: ["fish", "product", "credits", "users", "providers", "holders", "ocean"],
    body: "Fish should feel like one simple AI product: users buy AI, providers get paid, and OCEAN gains utility. Users should not need to understand a compute marketplace before getting value."
  },
  {
    id: "ocean-first-routing",
    title: "Ocean-first routing",
    source: "fish_simple_venice_like_product_spec_with_ocean_nodes.md",
    keywords: ["route", "routing", "fallback", "openrouter", "ocean-first", "budget"],
    body: "Fish should be Ocean-first and fallback-safe. Use Ocean or Oncompute where possible, use outside fallback only when needed and allowed, cap budgets, and label the final route clearly."
  },
  {
    id: "warm-inference",
    title: "Warm inference MVP",
    source: "docs/warm-inference-runbook.md",
    keywords: ["warm", "vllm", "runner", "node", "gpu", "model", "latency"],
    body: "The first practical warm inference route is one GPU host with a model kept warm behind Fish Gateway or Fish Runner, optionally next to Ocean Node for provider identity and anchoring."
  },
  {
    id: "ocean-batch",
    title: "Ocean batch path",
    source: "docs/ocean-batch-jobs-plan.md",
    keywords: ["docs", "batch", "summarize", "embeddings", "hash", "inputref", "oncompute"],
    body: "Docs and heavier work should use a hash-only Ocean batch contract. Fish sends references, not raw public proof text, then writes a batch receipt plus a normal Fish usage receipt."
  },
  {
    id: "privacy-ladder",
    title: "Privacy ladder",
    source: "docs/privacy-modes-plan.md",
    keywords: ["privacy", "external", "prompt", "logs", "runner", "tee", "private"],
    body: "Fish should match privacy claims to the actual route. External fallback means the outside provider policy applies. Stronger privacy labels arrive only with selected providers, hardened runners, or hardware-backed routes."
  },
  {
    id: "provider-readiness",
    title: "Provider readiness",
    source: "docs/provider-pilot-plan.md",
    keywords: ["provider", "benchmark", "payout", "health", "gpu", "allowlist", "bond"],
    body: "Selected providers need an online Ocean Node or identity layer, GPU environment, known price, benchmark pass, approved runner/container, no prompt/output logging policy, payout wallet, health endpoint, and support contact."
  }
];

export function buildFishKnowledgeContext(query: string, limit = 3) {
  const tokens = tokenize(query);
  const scored = FISH_KNOWLEDGE_SNIPPETS.map((snippet, index) => ({
    snippet,
    index,
    score: snippet.keywords.reduce((sum, keyword) => sum + (tokens.has(keyword) ? 2 : query.toLowerCase().includes(keyword) ? 1 : 0), 0)
  }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit));

  const selected = scored.some((row) => row.score > 0) ? scored : FISH_KNOWLEDGE_SNIPPETS.slice(0, Math.max(1, limit)).map((snippet, index) => ({ snippet, index, score: 0 }));
  const sources = selected.map(({ snippet }) => ({
    id: snippet.id,
    title: snippet.title,
    source: snippet.source
  }));
  const context = selected.map(({ snippet }) => `- ${snippet.title}: ${snippet.body}`).join("\n");

  return {
    context,
    sources
  };
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
}
