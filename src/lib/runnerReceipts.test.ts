import assert from "node:assert/strict";
import { test } from "node:test";
import { readAndVerifyRunnerReceipt, runnerReceiptSha256 } from "./runnerReceipts";

test("runner receipt validation marks stale receipts invalid when route context differs", () => {
  const receipt = buildUnsignedReceipt({
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

  const summary = readAndVerifyRunnerReceipt(
    { fish_runner: receipt },
    {
      routeId: "ocean-provider",
      providerId: "selected-ocean-provider",
      idempotencyKey: "current-request",
      status: "succeeded",
      model: "current-model",
      requestHash: runnerReceiptSha256(JSON.stringify([{ role: "user", content: "current prompt" }])),
      outputHash: runnerReceiptSha256("current output"),
      promptTokens: 11,
      completionTokens: 5
    }
  );

  assert.equal(summary?.signatureState, "invalid");
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:routeId/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:providerId/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:idempotencyKey/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:requestHash/);
  assert.match(summary?.signatureError ?? "", /receipt_context_mismatch:outputHash/);
});

test("runner receipt validation keeps a context-bound unsigned receipt unsigned", () => {
  const messages = [{ role: "user", content: "hello fish" }];
  const output = "hello ocean";
  const receipt = buildUnsignedReceipt({
    routeId: "ocean-provider",
    providerId: "selected-ocean-provider",
    idempotencyKey: "current-request",
    status: "succeeded",
    model: "current-model",
    requestHash: runnerReceiptSha256(JSON.stringify(messages)),
    outputHash: runnerReceiptSha256(output),
    inputTokens: 9,
    outputTokens: 4
  });

  const summary = readAndVerifyRunnerReceipt(
    { fish_runner: receipt },
    {
      routeId: "ocean-provider",
      providerId: "selected-ocean-provider",
      idempotencyKey: "current-request",
      status: "succeeded",
      model: "current-model",
      requestHash: runnerReceiptSha256(JSON.stringify(messages)),
      outputHash: runnerReceiptSha256(output),
      promptTokens: 9,
      completionTokens: 4
    }
  );

  assert.equal(summary?.signatureState, "unsigned");
  assert.equal(summary?.signatureError, null);
});

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
