import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const originalCwd = process.cwd();
let activeTempDir: string | null = null;
let fishLedger: typeof import("./fishLedger");

before(async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-ledger-api-key-race-"));
  process.chdir(activeTempDir);
  fishLedger = await import("./fishLedger");
});

after(async () => {
  process.chdir(originalCwd);
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("stale key updates cannot restore a rotated API key", async () => {
  const created = await fishLedger.createApiKey("Race rotation key", 100);
  const staleAuth = await authenticateKey(created.key);

  const rotation = await fishLedger.updateApiKey(staleAuth.ledger, staleAuth.account, { rotate: true }, staleAuth.keyHash);
  assert.equal(rotation.ok, true);
  assert.equal(rotation.rotated, true);
  assert.ok(rotation.key);

  const staleUpdate = await fishLedger.updateApiKey(staleAuth.ledger, staleAuth.account, { label: "Stale label", rotate: false }, staleAuth.keyHash);
  assert.equal(staleUpdate.ok, false);
  assert.equal(staleUpdate.error, "stale_api_key");

  const oldAuth = await authenticateKeyResult(created.key);
  const newAuth = await authenticateKeyResult(rotation.key);
  assert.equal(oldAuth.ok, false);
  assert.equal(oldAuth.error, "invalid_api_key");
  assert.equal(newAuth.ok, true);
});

test("stale key updates cannot un-revoke an API key", async () => {
  const created = await fishLedger.createApiKey("Race revoke key", 100);
  const staleAuth = await authenticateKey(created.key);

  const revocation = await fishLedger.revokeApiKey(staleAuth.ledger, staleAuth.account, staleAuth.keyHash);
  assert.equal(revocation.ok, true);

  const staleRotation = await fishLedger.updateApiKey(staleAuth.ledger, staleAuth.account, { rotate: true }, staleAuth.keyHash);
  assert.equal(staleRotation.ok, false);
  assert.equal(staleRotation.error, "stale_api_key");

  const oldAuth = await authenticateKeyResult(created.key);
  assert.equal(oldAuth.ok, false);
  assert.equal(oldAuth.error, "api_key_revoked");
});

async function authenticateKey(key: string) {
  const auth = await authenticateKeyResult(key);
  assert.equal(auth.ok, true);
  return auth;
}

function authenticateKeyResult(key: string) {
  return fishLedger.authenticateRequest(new Request("http://127.0.0.1/v1/balance", { headers: { authorization: `Bearer ${key}` } }));
}
