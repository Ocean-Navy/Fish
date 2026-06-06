import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { createCapacitySettlement, parseCapacitySettlementRequest, summarizeCapacitySettlements } from "./capacitySettlements";

let activeTempDir: string | null = null;

afterEach(async () => {
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("capacity settlement validation requires an idempotency key for onchain submission", () => {
  const parsed = parseCapacitySettlementRequest({
    grossUsdcAmount: 10,
    settlementSource: "api_subscription",
    submitOnchain: true
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.flatten().fieldErrors.idempotencyKey, ["idempotencyKey is required when submitOnchain is true"]);
  }
});

test("capacity settlement validation rejects impossible fee math", () => {
  const parsed = parseCapacitySettlementRequest({
    grossUsdcAmount: 10,
    netUsdcAmount: 8,
    operatorFeeUsdc: 3,
    settlementSource: "api_subscription"
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(parsed.error.flatten().fieldErrors.netUsdcAmount, ["netUsdcAmount plus operatorFeeUsdc must match grossUsdcAmount"]);
  }
});

test("capacity settlements are idempotent and stay snapshot without onchain submission", async () => {
  const dir = await useTempSettlementDir();
  const options = { settlementDir: dir };
  const first = await createCapacitySettlement({
    grossUsdcAmount: 100,
    netUsdcAmount: 90,
    operatorFeeUsdc: 10,
    settlementSource: "api_subscription",
    idempotencyKey: "capacity-settlement-test-001",
    submitOnchain: false,
    occurredAt: "2026-06-04T00:00:00.000Z"
  }, options);
  const second = await createCapacitySettlement({
    grossUsdcAmount: 100,
    netUsdcAmount: 90,
    operatorFeeUsdc: 10,
    settlementSource: "api_subscription",
    idempotencyKey: "capacity-settlement-test-001",
    submitOnchain: false,
    occurredAt: "2026-06-04T00:00:01.000Z"
  }, options);
  const files = await readdir(dir);
  const summary = await summarizeCapacitySettlements(options);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.settlement.settlementId, first.settlement.settlementId);
  assert.equal(files.filter((file) => file.endsWith(".json")).length, 1);
  assert.equal(summary.dataState, "snapshot");
  assert.equal(summary.totals.settlements, 1);
  assert.equal(summary.totals.grossUsdcAmount, 100);
  assert.equal(summary.totals.netUsdcAmount, 90);
  assert.equal(summary.totals.operatorFeeUsdc, 10);
  assert.equal(summary.totals.onchainSubmittedSettlements, 0);
});

test("concurrent capacity settlements with the same idempotency key write one record", async () => {
  const dir = await useTempSettlementDir();
  const options = { settlementDir: dir };
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      createCapacitySettlement(
        {
          grossUsdcAmount: 50,
          netUsdcAmount: 45,
          operatorFeeUsdc: 5,
          settlementSource: "api_subscription",
          idempotencyKey: "capacity-settlement-race-001",
          submitOnchain: false,
          occurredAt: `2026-06-04T00:00:0${index}.000Z`
        },
        options
      )
    )
  );
  const files = await readdir(dir);
  const settlementIds = new Set(results.map((result) => result.settlement.settlementId));

  assert.equal(settlementIds.size, 1);
  assert.equal(results.filter((result) => result.idempotent).length, 4);
  assert.equal(files.filter((file) => file.endsWith(".json")).length, 1);
});

async function useTempSettlementDir() {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-capacity-settlements-"));
  return activeTempDir;
}
