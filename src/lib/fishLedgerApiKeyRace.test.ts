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

test("a rotate racing a usage settle loses neither the debit nor the new key", async () => {
  const created = await fishLedger.createApiKey("Concurrent rotate/settle key", 100);
  // Two independent auth snapshots, as two concurrent requests would hold.
  const settleAuth = await authenticateKey(created.key);
  const rotateAuth = await authenticateKey(created.key);

  const [usage, rotation] = await Promise.all([
    fishLedger.recordChatUsage({
      ledger: settleAuth.ledger,
      account: settleAuth.account,
      input: { model: "fish-demo-chat", messages: [{ role: "user", content: "hello" }], stream: false },
      promptTokens: 10,
      completionTokens: 10,
      content: "hello"
    }),
    fishLedger.updateApiKey(rotateAuth.ledger, rotateAuth.account, { rotate: true }, rotateAuth.keyHash)
  ]);

  assert.equal(usage.ok, true);
  assert.equal(rotation.ok, true);
  if (!usage.ok || !rotation.ok || !rotation.key) {
    throw new Error("concurrent rotate/settle setup failed");
  }

  // The rotated-away key must be dead and the new key live — regardless of
  // which operation won the ledger lock.
  const oldAuth = await authenticateKeyResult(created.key);
  assert.equal(oldAuth.ok, false);
  const newAuth = await authenticateKey(rotation.key);

  // And the settle's debit must have survived the rotate's whole-snapshot write.
  assert.equal(newAuth.account.creditBalance, usage.creditsRemaining);
  assert.ok(newAuth.account.creditBalance < 100);
});

async function authenticateKey(key: string) {
  const auth = await authenticateKeyResult(key);
  assert.equal(auth.ok, true);
  return auth;
}

function authenticateKeyResult(key: string) {
  return fishLedger.authenticateRequest(new Request("http://127.0.0.1/v1/balance", { headers: { authorization: `Bearer ${key}` } }));
}
