import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getFishMinuteRateLimitBucketCountForTests,
  resetFishMinuteRateLimitForTests,
  spendFishMinuteRateLimit
} from "./fishRateLimit";

afterEach(() => {
  resetFishMinuteRateLimitForTests();
});

test("Fish minute rate limit resets expired principal buckets", () => {
  spendFishMinuteRateLimit("guest:one", 2, 1_000);
  spendFishMinuteRateLimit("guest:two", 2, 2_000);
  assert.equal(getFishMinuteRateLimitBucketCountForTests(), 2);

  const nextWindow = spendFishMinuteRateLimit("guest:three", 2, 61_000);
  assert.equal(nextWindow.ok, true);
  assert.equal(nextWindow.used, 1);
  assert.equal(getFishMinuteRateLimitBucketCountForTests(), 1);
});

test("Fish minute rate limit caps retained principal buckets", () => {
  for (let index = 0; index < 10_025; index += 1) {
    spendFishMinuteRateLimit(`guest:${index}`, 2, 1_000);
  }

  assert.equal(getFishMinuteRateLimitBucketCountForTests(), 10_000);

  const reusedRecentPrincipal = spendFishMinuteRateLimit("guest:10024", 2, 2_000);
  assert.equal(reusedRecentPrincipal.ok, true);
  assert.equal(reusedRecentPrincipal.used, 2);

  const evictedOldPrincipal = spendFishMinuteRateLimit("guest:0", 2, 3_000);
  assert.equal(evictedOldPrincipal.ok, true);
  assert.equal(evictedOldPrincipal.used, 1);
  assert.equal(getFishMinuteRateLimitBucketCountForTests(), 10_000);
});
