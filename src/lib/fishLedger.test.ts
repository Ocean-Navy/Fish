import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

let activeTempDir: string | null = null;

afterEach(async () => {
  delete process.env.FISH_LEDGER_DIR;
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("stale authenticated ledger writes do not undo API key revocation", async () => {
  const ledger = await useTempFishLedger();
  const { createApiKey, authenticateRequest, reserveFishCredits, revokeApiKey } = await importFishLedger(ledger);
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

async function useTempFishLedger() {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-ledger-race-"));
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
