import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { anonymousGuestId, anonymousGuestIdentityStatus, resolveAnonymousGuestIdentity } from "./guestIdentity";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  delete process.env.FISH_GUEST_ID_SALT;
  setNodeEnv(ORIGINAL_NODE_ENV);
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

test("anonymous guest identity allows local development without a salt", () => {
  setNodeEnv("development");
  delete process.env.FISH_GUEST_ID_SALT;

  const status = anonymousGuestIdentityStatus();
  const identity = resolveAnonymousGuestIdentity();

  assert.deepEqual(status, {
    saltConfigured: false,
    saltRequired: false,
    ready: true
  });
  assert.equal(identity.ok, true);
  if (identity.ok) {
    assert.match(identity.guestId, /^[a-f0-9]{32}$/);
    assert.equal(identity.principalId, `guest:${identity.guestId}`);
  }
});

test("anonymous guest identity fails closed in production without a salt", () => {
  setNodeEnv("production");
  delete process.env.FISH_GUEST_ID_SALT;

  const status = anonymousGuestIdentityStatus();
  const identity = resolveAnonymousGuestIdentity();

  assert.deepEqual(status, {
    saltConfigured: false,
    saltRequired: true,
    ready: false
  });
  assert.deepEqual(identity, {
    ok: false,
    status: 503,
    error: "guest_identity_salt_required"
  });
});

test("anonymous guest identity resolves in production with a salt", () => {
  setNodeEnv("production");
  process.env.FISH_GUEST_ID_SALT = "public-testnet-demo";

  const status = anonymousGuestIdentityStatus();
  const identity = resolveAnonymousGuestIdentity();

  assert.deepEqual(status, {
    saltConfigured: true,
    saltRequired: true,
    ready: true
  });
  assert.equal(identity.ok, true);
  if (identity.ok) {
    assert.match(identity.guestId, /^[a-f0-9]{32}$/);
    assert.equal(identity.principalId, `guest:${identity.guestId}`);
  }
});

function setNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = value;
  }
}
