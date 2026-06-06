import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, test } from "node:test";
import { getWarmInferenceStatus } from "@/lib/warmInferenceStatus";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("warm status skips live backend probes by default", async () => {
  configureWarmRoute();
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("default status must not call the warm backend");
  }) as typeof fetch;

  const status = await getWarmInferenceStatus();

  assert.equal(fetchCalls, 0);
  assert.equal(status.dataState, "snapshot");
  assert.equal(status.probe.state, "skipped");
  assert.equal(status.probe.statusCode, null);
  assert.equal(status.probe.latencyMs, null);
  assert.deepEqual(status.runnerReceiptTrust, {
    configured: false,
    trustedKeyCount: 0,
    invalidKeyCount: 0
  });
  assert.match(status.warnings.join("\n"), /Trusted runner receipt public key is not configured/);
});

test("warm status only calls the warm backend when a live probe is requested", async () => {
  configureWarmRoute();
  const seen: { url?: string; authorization?: string } = {};
  globalThis.fetch = (async (input, init) => {
    seen.url = String(input);
    seen.authorization = new Headers(init?.headers).get("authorization") ?? undefined;
    return Response.json({ data: [{ id: "fish-warm-chat" }] });
  }) as typeof fetch;

  const status = await getWarmInferenceStatus({ probe: true });

  assert.equal(seen.url, "http://127.0.0.1:4017/v1/models");
  assert.equal(seen.authorization, "Bearer SECRET_WARM_KEY");
  assert.equal(status.dataState, "live");
  assert.equal(status.probe.state, "ok");
  assert.equal(status.probe.statusCode, 200);
  assert.equal(status.probe.modelVisible, true);
});

test("warm status exposes trusted runner receipt key readiness without key material", async () => {
  configureWarmRoute();
  const { publicKey } = generateKeyPairSync("ed25519");
  process.env.FISH_RUNNER_PUBLIC_KEY_ID = "runner-test-key";
  process.env.FISH_RUNNER_PUBLIC_KEY_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

  const status = await getWarmInferenceStatus();

  assert.deepEqual(status.runnerReceiptTrust, {
    configured: true,
    trustedKeyCount: 1,
    invalidKeyCount: 0
  });
  assert.doesNotMatch(JSON.stringify(status), /BEGIN PUBLIC KEY/);
  assert.doesNotMatch(status.warnings.join("\n"), /Trusted runner receipt public key is not configured/);
});

test("warm status warns about invalid runner receipt keys", async () => {
  configureWarmRoute();
  process.env.FISH_RUNNER_PUBLIC_KEY_ID = "runner-bad-key";
  process.env.FISH_RUNNER_PUBLIC_KEY_PEM = "not a pem";

  const status = await getWarmInferenceStatus();

  assert.deepEqual(status.runnerReceiptTrust, {
    configured: false,
    trustedKeyCount: 0,
    invalidKeyCount: 1
  });
  assert.match(status.warnings.join("\n"), /could not be parsed/);
});

function configureWarmRoute() {
  process.env.FISH_CHAT_ROUTE = "ocean-demo-vllm";
  process.env.FISH_OCEAN_DEMO_VLLM_BASE_URL = "http://127.0.0.1:4017/v1";
  process.env.FISH_OCEAN_DEMO_VLLM_API_KEY = "SECRET_WARM_KEY";
  process.env.FISH_OCEAN_DEMO_VLLM_MODEL = "fish-warm-chat";
  process.env.FISH_OCEAN_DEMO_PROVIDER_ID = "test-provider";
}
