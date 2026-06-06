import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTestnetFaucetClientIdentity } from "./testnetFaucetIdentity";

const SECRET = "fishproxytoken32charsabcdefghi";

test("faucet client identity fails closed in production without trusted proxy headers", () => {
  const identity = resolveTestnetFaucetClientIdentity(new Headers([["x-forwarded-for", "203.0.113.10"]]), {
    NODE_ENV: "production"
  });

  assert.deepEqual(identity, {
    ok: false,
    status: 503,
    error: "testnet_faucet_proxy_identity_required"
  });
});

test("faucet client identity allows local development without proxy setup", () => {
  const identity = resolveTestnetFaucetClientIdentity(new Headers([["x-forwarded-for", "203.0.113.10"]]), {
    NODE_ENV: "development"
  });

  assert.deepEqual(identity, {
    ok: true,
    ipAddress: "local-development"
  });
});

test("faucet client identity requires a configured proxy secret when proxy headers are trusted", () => {
  const identity = resolveTestnetFaucetClientIdentity(new Headers([["x-forwarded-for", "203.0.113.10"]]), {
    NODE_ENV: "production",
    FISH_TRUST_PROXY_HEADERS: "true"
  });

  assert.deepEqual(identity, {
    ok: false,
    status: 503,
    error: "testnet_faucet_proxy_secret_required"
  });
});

test("faucet client identity rejects unsigned proxy headers", () => {
  const identity = resolveTestnetFaucetClientIdentity(new Headers([["x-forwarded-for", "203.0.113.10"]]), {
    NODE_ENV: "production",
    FISH_TRUST_PROXY_HEADERS: "true",
    FISH_PROXY_HEADER_SECRET: SECRET
  });

  assert.deepEqual(identity, {
    ok: false,
    status: 403,
    error: "testnet_faucet_proxy_secret_invalid"
  });
});

test("faucet client identity accepts signed proxy headers", () => {
  const identity = resolveTestnetFaucetClientIdentity(
    new Headers([
      ["x-fish-proxy-secret", SECRET],
      ["x-forwarded-for", "203.0.113.10, 10.0.0.4"]
    ]),
    {
      NODE_ENV: "production",
      FISH_TRUST_PROXY_HEADERS: "true",
      FISH_PROXY_HEADER_SECRET: SECRET
    }
  );

  assert.deepEqual(identity, {
    ok: true,
    ipAddress: "203.0.113.10"
  });
});
