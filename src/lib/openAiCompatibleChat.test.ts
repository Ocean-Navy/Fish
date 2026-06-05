import assert from "node:assert/strict";
import { type AddressInfo } from "node:net";
import { createServer, type IncomingMessage } from "node:http";
import { afterEach, test } from "node:test";
import { runOpenAiCompatibleChat } from "./openAiCompatibleChat";
import { runnerReceiptSha256 } from "./runnerReceipts";

let activeServer: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (activeServer) {
    await new Promise<void>((resolve, reject) => {
      activeServer?.close((error) => (error ? reject(error) : resolve()));
    });
    activeServer = null;
  }
});

test("OpenAI-compatible chat marks a replayed provider runner receipt invalid", async () => {
  const seen: { routeHeader?: string; idempotencyHeader?: string; body?: Record<string, unknown> } = {};
  activeServer = createServer(async (request, response) => {
    seen.routeHeader = headerString(request, "x-fish-route-id");
    seen.idempotencyHeader = headerString(request, "x-fish-idempotency-key");
    seen.body = JSON.parse(await readBody(request)) as Record<string, unknown>;

    const staleReceipt = buildUnsignedReceipt({
      routeId: "external-fallback",
      providerId: "old-provider",
      idempotencyKey: "old-request",
      status: "failed",
      model: "old-model",
      requestHash: runnerReceiptSha256(JSON.stringify([{ role: "user", content: "old prompt" }])),
      outputHash: runnerReceiptSha256("old output"),
      inputTokens: 7,
      outputTokens: 3
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      model: "current-model",
      choices: [{ message: { content: "current output" } }],
      usage: { prompt_tokens: 11, completion_tokens: 5 },
      fish_runner: staleReceipt
    }));
  });
  await new Promise<void>((resolve) => activeServer?.listen(0, "127.0.0.1", resolve));
  const address = activeServer.address();
  assert.equal(typeof address, "object");
  assert(address);
  const port = (address as AddressInfo).port;

  const result = await runOpenAiCompatibleChat(
    {
      model: "current-model",
      messages: [{ role: "user", content: "current prompt" }],
      stream: false
    },
    {
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: null,
      model: "current-model",
      providerId: "selected-ocean-provider",
      costUsdPer1kTokens: 0.01
    },
    { promptTokens: 11, completionTokens: 5 },
    { routeId: "ocean-provider", idempotencyKey: "current-request", maxBudgetUsd: 1 }
  );

  assert.equal(seen.routeHeader, "ocean-provider");
  assert.equal(seen.idempotencyHeader, "current-request");
  assert.deepEqual((seen.body?.metadata as Record<string, unknown>).fish_route_id, "ocean-provider");
  assert.equal(result.runnerReceipt?.signatureState, "invalid");
  assert.match(result.runnerReceipt?.signatureError ?? "", /receipt_context_mismatch:routeId/);
  assert.match(result.runnerReceipt?.signatureError ?? "", /receipt_context_mismatch:requestHash/);
});

function headerString(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function buildUnsignedReceipt(input: {
  routeId: string;
  providerId: string;
  idempotencyKey: string;
  status: string;
  model: string;
  requestHash: string;
  outputHash: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const unsignedReceipt = {
    runnerReceiptVersion: 1,
    jobId: "job_test",
    routeId: input.routeId,
    idempotencyKey: input.idempotencyKey,
    providerId: input.providerId,
    runnerId: "runner_test",
    model: input.model,
    engine: "vllm",
    status: input.status,
    startedAt: "2026-06-05T00:00:00.000Z",
    completedAt: "2026-06-05T00:00:01.000Z",
    usage: {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      gpuSeconds: 1
    },
    timing: {
      firstTokenMs: 50,
      totalMs: 1000
    },
    hashes: {
      requestHash: input.requestHash,
      outputHash: input.outputHash
    }
  };
  return {
    ...unsignedReceipt,
    hashes: {
      ...unsignedReceipt.hashes,
      canonicalReceiptHash: runnerReceiptSha256(stableStringify(unsignedReceipt))
    },
    signer: {
      keyId: null,
      algorithm: "none"
    },
    signature: null
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}
