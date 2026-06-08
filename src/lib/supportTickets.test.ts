import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { POST, resetSupportRateLimitForTest } from "../../app/api/support/route";
import { listSupportTickets, saveSupportTicket } from "./supportTickets";

const SUPPORT_ENV_KEYS = [
  "FISH_SUPPORT_DIR",
  "FISH_SUPPORT_MAX_BODY_BYTES",
  "FISH_SUPPORT_MAX_TICKETS",
  "FISH_SUPPORT_RATE_LIMIT_PER_MINUTE",
  "FISH_SUPPORT_GLOBAL_RATE_LIMIT_PER_MINUTE",
  "FISH_SUPPORT_RATE_LIMIT_WINDOW_MS",
  "FISH_SUPPORT_TRUST_PROXY_HEADERS"
] as const;

const originalEnv = Object.fromEntries(SUPPORT_ENV_KEYS.map((key) => [key, process.env[key]]));
const tempDirs: string[] = [];

afterEach(async () => {
  resetSupportRateLimitForTest();
  for (const key of SUPPORT_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

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

test("support route rejects oversized JSON before parsing", async () => {
  process.env.FISH_SUPPORT_DIR = await tempSupportDir();
  process.env.FISH_SUPPORT_MAX_BODY_BYTES = "128";

  const response = await POST(
    new Request("http://127.0.0.1:3000/api/support", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
      body: JSON.stringify({ contact: "test@example.com", message: "hello support", padding: "x".repeat(512) })
    })
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { ok: false, error: "support_request_too_large" });
});

test("support route rate limits unauthenticated ticket submissions", async () => {
  process.env.FISH_SUPPORT_DIR = await tempSupportDir();
  process.env.FISH_SUPPORT_RATE_LIMIT_PER_MINUTE = "1";
  const body = JSON.stringify({ contact: "test@example.com", kind: "billing", message: "hello support" });

  const first = await POST(
    new Request("http://127.0.0.1:3000/api/support", { method: "POST", headers: { "x-forwarded-for": "198.51.100.11" }, body })
  );
  const second = await POST(
    new Request("http://127.0.0.1:3000/api/support", { method: "POST", headers: { "x-forwarded-for": "198.51.100.11" }, body })
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.deepEqual(await second.json(), { ok: false, error: "support_rate_limited" });
});

test("support route does not trust spoofed proxy headers by default", async () => {
  const dir = await tempSupportDir();
  process.env.FISH_SUPPORT_DIR = dir;
  process.env.FISH_SUPPORT_RATE_LIMIT_PER_MINUTE = "1";
  process.env.FISH_SUPPORT_MAX_TICKETS = "3";
  const body = JSON.stringify({ contact: "test@example.com", kind: "billing", message: "hello support" });

  const first = await POST(
    new Request("http://127.0.0.1:3000/api/support", {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.21, 203.0.113.9" },
      body
    })
  );
  const second = await POST(
    new Request("http://127.0.0.1:3000/api/support", {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.22, 203.0.113.9" },
      body
    })
  );
  const files = await readdir(dir);

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.deepEqual(await second.json(), { ok: false, error: "support_rate_limited" });
  assert.equal(files.filter((file) => file.endsWith(".json")).length, 1);
});

test("support route applies a global backstop when trusted proxy keys rotate", async () => {
  process.env.FISH_SUPPORT_DIR = await tempSupportDir();
  process.env.FISH_SUPPORT_TRUST_PROXY_HEADERS = "true";
  process.env.FISH_SUPPORT_RATE_LIMIT_PER_MINUTE = "10";
  process.env.FISH_SUPPORT_GLOBAL_RATE_LIMIT_PER_MINUTE = "2";
  const body = JSON.stringify({ contact: "test@example.com", kind: "billing", message: "hello support" });

  const responses = await Promise.all(
    ["198.51.100.31", "198.51.100.32", "198.51.100.33"].map((client) =>
      POST(
        new Request("http://127.0.0.1:3000/api/support", {
          method: "POST",
          headers: { "x-forwarded-for": `${client}, 203.0.113.9` },
          body
        })
      )
    )
  );

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 429]
  );
  assert.deepEqual(await responses[2].json(), { ok: false, error: "support_rate_limited" });
});

test("support ticket storage cap rejects new files once the cap is reached", async () => {
  const dir = await tempSupportDir();
  process.env.FISH_SUPPORT_DIR = dir;
  process.env.FISH_SUPPORT_MAX_TICKETS = "1";
  const ticket = { contact: "test@example.com", kind: "technical", message: "hello support" };

  const first = await saveSupportTicket(ticket);
  const second = await saveSupportTicket(ticket);
  const files = await readdir(dir);

  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, status: 503, error: "support_ticket_storage_full" });
  assert.equal(files.filter((file) => file.endsWith(".json")).length, 1);
});

async function tempSupportDir() {
  const dir = await mkdtemp(join(tmpdir(), "fish-support-"));
  tempDirs.push(dir);
  return dir;
}
