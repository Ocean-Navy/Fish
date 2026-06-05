import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { anonymousGuestId } from "./guestIdentity";

afterEach(() => {
  delete process.env.FISH_GUEST_ID_SALT;
});

test("anonymous guest identity is stable across spoofable request metadata", () => {
  const first = anonymousGuestId();
  const second = anonymousGuestId();

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{32}$/);
});

test("anonymous guest identity can be deployment scoped with a salt", () => {
  process.env.FISH_GUEST_ID_SALT = "deployment-a";
  const deploymentA = anonymousGuestId();

  process.env.FISH_GUEST_ID_SALT = "deployment-b";
  const deploymentB = anonymousGuestId();

  assert.notEqual(deploymentA, deploymentB);
});
