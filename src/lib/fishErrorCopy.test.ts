import assert from "node:assert/strict";
import { test } from "node:test";
import { describeFishOrderError } from "./fishErrorCopy";

test("insufficient credits explains the shortfall and points at credit options", () => {
  const copy = describeFishOrderError(402, { error: { message: "insufficient_fish_credits", needed: 5, available: 2 } });
  assert.equal(copy.title, "Out of Fish credits");
  assert.match(copy.body, /needs 5 credits; 2 left/);
  assert.equal(copy.action?.href, "/credits");
  assert.equal(copy.code, "insufficient_fish_credits");
});

test("daily quota and rate limit errors get plain language", () => {
  assert.match(describeFishOrderError(429, { error: { message: "daily_quota_exceeded" } }).body, /resets at midnight UTC/);
  assert.equal(describeFishOrderError(429, { error: { message: "rate_limit_exceeded" } }).title, "A little too fast");
});

test("backend and timeout errors reassure that nothing was charged", () => {
  assert.match(describeFishOrderError(502, { error: { message: "ocean_demo_vllm_backend_error" } }).body, /nothing was charged/i);
  assert.match(describeFishOrderError(504, { error: { message: "openai_compatible_timeout" } }).body, /credits were released/i);
});

test("unknown errors keep the raw code visible for support", () => {
  const copy = describeFishOrderError(500, null);
  assert.equal(copy.code, "http_500");
  assert.match(copy.body, /try again/i);
});
