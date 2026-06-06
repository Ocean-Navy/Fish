import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { listSupportTickets, saveSupportTicket } from "./supportTickets";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.FISH_SUPPORT_DIR;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

test("support tickets store public-safe customer care fields", async () => {
  const dir = await tempSupportDir();
  process.env.FISH_SUPPORT_DIR = dir;

  const result = await saveSupportTicket({
    contact: "pilot@example.com",
    kind: "refund",
    accountOrPaymentRef: "pay_123",
    message: "The payment duplicated.",
    company: ""
  });

  assert.equal(result.ok, true);
  const rows = await listSupportTickets("refund");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].body.contact, "pilot@example.com");
  assert.equal(rows[0].body.kind, "refund");
  assert.equal(rows[0].body.accountOrPaymentRef, "pay_123");
  assert.equal(rows[0].body.message, "The payment duplicated.");
  assert.equal("company" in rows[0].body, false);
});

test("support tickets reject honeypot and missing message submissions", async () => {
  const dir = await tempSupportDir();
  process.env.FISH_SUPPORT_DIR = dir;

  const honeypot = await saveSupportTicket({
    contact: "pilot@example.com",
    kind: "billing",
    message: "Please check",
    company: "bot"
  });
  const missingMessage = await saveSupportTicket({
    contact: "pilot@example.com",
    kind: "billing",
    message: ""
  });

  assert.equal(honeypot.ok, false);
  assert.equal(missingMessage.ok, false);
  assert.deepEqual(await listSupportTickets(), []);
});

async function tempSupportDir() {
  const dir = path.join(tmpdir(), `fish-support-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}
