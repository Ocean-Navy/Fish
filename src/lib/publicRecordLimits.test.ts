import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const originalCwd = process.cwd();
const originalSubmissionLimit = process.env.FISH_MAX_PUBLIC_SUBMISSIONS_PER_KIND;
const originalWalletIntentLimit = process.env.FISH_MAX_WALLET_INTENTS;
let activeTempDir: string | null = null;

afterEach(async () => {
  process.chdir(originalCwd);
  restoreEnv("FISH_MAX_PUBLIC_SUBMISSIONS_PER_KIND", originalSubmissionLimit);
  restoreEnv("FISH_MAX_WALLET_INTENTS", originalWalletIntentLimit);
  if (activeTempDir) {
    await rm(activeTempDir, { recursive: true, force: true });
    activeTempDir = null;
  }
});

test("public submissions reject writes after the per-kind cap", async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-submission-cap-"));
  process.chdir(activeTempDir);
  process.env.FISH_MAX_PUBLIC_SUBMISSIONS_PER_KIND = "1";
  const { saveSubmission } = await import(`./submissions.ts?cap=${Date.now()}`);
  const body = {
    contact: "captain@example.test",
    subscriberRoles: ["user"]
  };

  const results = await Promise.all(Array.from({ length: 5 }, () => saveSubmission("waitlist", body)));
  const accepted = results.filter((result) => result.ok);
  const rejected = results.filter((result) => !result.ok);

  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 4);
  for (const result of rejected) {
    assert.deepEqual(result, {
      ok: false,
      status: 429,
      error: "submission_limit_reached",
      limit: 1
    });
  }
});

test("wallet intents reject writes after the cap", async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-wallet-intent-cap-"));
  process.chdir(activeTempDir);
  process.env.FISH_MAX_WALLET_INTENTS = "1";
  const { createWalletIntent } = await import(`./walletIntents.ts?cap=${Date.now()}`);
  const address = "0x1111111111111111111111111111111111111111";
  const input = {
    holderLabel: "Ocean holder",
    address,
    chainId: 1,
    oceanAmount: 100,
    lockDays: 30,
    message: `Fish OCEAN credit intent for ${address}. I understand this does not issue credits yet.`,
    signature: `0x${"a".repeat(130)}`
  };

  const results = await Promise.all(Array.from({ length: 5 }, () => createWalletIntent(input)));
  const accepted = results.filter((result) => result.ok);
  const rejected = results.filter((result) => !result.ok);

  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 4);
  for (const result of rejected) {
    assert.deepEqual(result, {
      ok: false,
      status: 429,
      error: "wallet_intent_limit_reached",
      limit: 1
    });
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
