import assert from "node:assert/strict";
import { test } from "node:test";
import { getSharedGuestIdentity, SHARED_GUEST_ID, SHARED_GUEST_PRINCIPAL_ID } from "@/lib/fishGuest";

test("shared guest identity is stable and not derived from request headers", () => {
  const first = getSharedGuestIdentity();
  const second = getSharedGuestIdentity();

  assert.equal(first.guestId, SHARED_GUEST_ID);
  assert.equal(first.principalId, SHARED_GUEST_PRINCIPAL_ID);
  assert.deepEqual(first, second);
  assert.equal(first.principalId, `guest:${first.guestId}`);
});
