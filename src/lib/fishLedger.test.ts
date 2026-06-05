import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { requireAdmin } from "./fishLedger";

const originalAdminToken = process.env.FISH_ADMIN_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalAdminToken === undefined) {
    delete mutableEnv.FISH_ADMIN_TOKEN;
  } else {
    mutableEnv.FISH_ADMIN_TOKEN = originalAdminToken;
  }

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }
});

test("requireAdmin rejects the public placeholder admin token in production", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.FISH_ADMIN_TOKEN = "change-me-for-production";

  const request = new Request("http://127.0.0.1:3000/v1/api_keys", {
    headers: { "x-fish-admin-token": "change-me-for-production" }
  });

  assert.deepEqual(requireAdmin(request), {
    ok: false,
    status: 401,
    error: "admin_token_required"
  });
});

test("requireAdmin accepts a configured non-placeholder admin token in production", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.FISH_ADMIN_TOKEN = "fish-admin-test-secret";

  const request = new Request("http://127.0.0.1:3000/v1/api_keys", {
    headers: { authorization: "Bearer fish-admin-test-secret" }
  });

  assert.deepEqual(requireAdmin(request), { ok: true });
});
