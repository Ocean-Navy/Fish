import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFishDishChatInput, getFishDish } from "./fishDishes";

test("dish chat input clamps max_tokens to the supplied feature output cap", () => {
  const codeDish = getFishDish("code");
  assert.ok(codeDish);

  const input = buildFishDishChatInput(
    codeDish,
    {
      prompt: "Write a TypeScript helper.",
      maxTokens: 1200
    },
    "Smart route",
    800
  );

  assert.equal(input.max_tokens, 800);
  assert.equal(input.metadata?.fish_feature, "code");
});
