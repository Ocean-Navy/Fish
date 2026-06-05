import assert from "node:assert/strict";
import { test } from "node:test";
import { getSharedGuestIdentity } from "@/lib/fishGuest";

test("shared guest identity is stable and not derived from request headers", () => {
  const first = getSharedGuestIdentity();
  const second = getSharedGuestIdentity();

  assert.match(first.guestId, /^[a-f0-9]{32}$/);
  assert.equal(first.principalId, `guest:${first.guestId}`);
  assert.deepEqual(first, second);
});
