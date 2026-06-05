import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFishKnowledgeContext, FISH_KNOWLEDGE_QUERY_CHAR_LIMIT } from "./fishKnowledge";

test("Fish knowledge scoring only inspects a bounded prefix of the prompt", () => {
  const oversizedQuery = `${"x".repeat(FISH_KNOWLEDGE_QUERY_CHAR_LIMIT)} provider benchmark payout health gpu allowlist bond`;

  const knowledge = buildFishKnowledgeContext(oversizedQuery, 1);

  assert.equal(knowledge.sources[0]?.id, "fish-product-loop");
});
