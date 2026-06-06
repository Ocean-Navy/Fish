import assert from "node:assert/strict";
import { test } from "node:test";
import { readJsonRequestBody } from "./requestBody";

test("readJsonRequestBody parses bounded JSON", async () => {
  const result = await readJsonRequestBody(
    new Request("http://127.0.0.1/test", {
      method: "POST",
      body: JSON.stringify({ model: "fish-demo-chat" })
    }),
    { maxBytes: 128 }
  );

  assert.deepEqual(result, { ok: true, body: { model: "fish-demo-chat" } });
});

test("readJsonRequestBody rejects oversized JSON before parsing", async () => {
  const result = await readJsonRequestBody(
    new Request("http://127.0.0.1/test", {
      method: "POST",
      body: JSON.stringify({ prompt: "x".repeat(200) })
    }),
    { maxBytes: 32 }
  );

  assert.deepEqual(result, { ok: false, status: 413, error: "request_body_too_large", maxBytes: 32 });
});

test("readJsonRequestBody rejects malformed JSON", async () => {
  const result = await readJsonRequestBody(
    new Request("http://127.0.0.1/test", {
      method: "POST",
      body: "{not-json"
    }),
    { maxBytes: 128 }
  );

  assert.deepEqual(result, { ok: false, status: 400, error: "invalid_json_body", maxBytes: 128 });
});
