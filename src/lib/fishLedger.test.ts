import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { requireAdmin } from "./fishLedger";

const originalAdminToken = process.env.FISH_ADMIN_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;
let activeTempDir: string | null = null;

afterEach(async () => {
  delete process.env.FISH_LEDGER_DIR;
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }

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

test("expired top-up credits are not spendable", async () => {
  const ledger = await useTempFishLedger();
  const { addFishCredits, authenticateRequest, createApiKey, recordChatUsage, reserveFishCredits } = await importFishLedger(ledger);
  const { key, account } = await createApiKey("Expired credit test", 0);

  const topup = await addFishCredits({
    accountId: account.id,
    amount: 5,
    lane: "prepaid",
    reason: "expired_credit_test",
    expiresAt: "2000-01-01T00:00:00.000Z"
  });
  assert.equal(topup.ok, true);
  assert.equal(topup.creditsRemaining, 5);

  const auth = await authenticateRequest(authorizedRequest(key));
  assert.equal(auth.ok, true);
  if (!auth.ok) {
    throw new Error("test account authentication failed");
  }

  const reservation = await reserveFishCredits({
    ledger: auth.ledger,
    account: auth.account,
    credits: 1,
    reason: "expired_credit_test_reserve"
  });
  assert.equal(reservation.ok, false);
  assert.equal(reservation.status, 402);
  assert.equal(reservation.available, 0);

  const usage = await recordChatUsage({
    ledger: auth.ledger,
    account: auth.account,
    input: {
      model: "fish-demo-chat",
      messages: [{ role: "user", content: "hello" }],
      stream: false
    },
    promptTokens: 1000,
    completionTokens: 1,
    content: "hello"
  });
  assert.equal(usage.ok, false);
  assert.equal(usage.status, 402);
  assert.equal(usage.available, 0);
});

test("stale authenticated ledger writes do not undo API key revocation", async () => {
  const ledger = await useTempFishLedger();
  const { authenticateRequest, createApiKey, reserveFishCredits, revokeApiKey } = await importFishLedger(ledger);
  const created = await createApiKey("Race test key", 10);
  const request = authorizedRequest(created.key);
  const staleAuth = await authenticateRequest(request);
  assert.equal(staleAuth.ok, true);

  const revokeAuth = await authenticateRequest(request);
  assert.equal(revokeAuth.ok, true);
  if (!staleAuth.ok || !revokeAuth.ok) {
    throw new Error("expected both snapshots to authenticate before revoke");
  }

  const revokeResult = await revokeApiKey(revokeAuth.ledger, revokeAuth.account);
  assert.equal(revokeResult.ok, true);
  assert.equal(revokeResult.alreadyRevoked, false);

  const revokedAuth = await authenticateRequest(request);
  assert.equal(revokedAuth.ok, false);
  if (revokedAuth.ok) {
    throw new Error("expected revoked key to fail authentication");
  }
  assert.equal(revokedAuth.error, "api_key_revoked");

  const staleReserve = await reserveFishCredits({
    ledger: staleAuth.ledger,
    account: staleAuth.account,
    credits: 1,
    reason: "stale_write_after_revoke"
  });
  assert.equal(staleReserve.ok, true);

  const authAfterStaleWrite = await authenticateRequest(request);
  assert.equal(authAfterStaleWrite.ok, false);
  if (authAfterStaleWrite.ok) {
    throw new Error("expected stale write to preserve the revocation");
  }
  assert.equal(authAfterStaleWrite.error, "api_key_revoked");
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

async function useTempFishLedger() {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-ledger-security-"));
  return activeTempDir;
}

async function importFishLedger(ledgerDir: string) {
  process.env.FISH_LEDGER_DIR = ledgerDir;
  return import(`./fishLedger?ledger=${encodeURIComponent(ledgerDir)}&t=${Date.now()}`);
}

function authorizedRequest(key: string) {
  return new Request("http://127.0.0.1/v1", {
    headers: {
      authorization: `Bearer ${key}`
    }
  });
}
