import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getFishRouteHealth, recordFishRouteFailure, recordFishRouteSuccess, resetFishRouteHealthForTests } from "./fishRouteHealth";

beforeEach(() => {
  resetFishRouteHealthForTests();
});

test("routes with no observations report unknown, mock is always ok", () => {
  assert.equal(getFishRouteHealth("ocean-demo-vllm").state, "unknown");
  assert.equal(getFishRouteHealth("mock").state, "ok");
});

test("a recent failure marks the route degraded with the error code", () => {
  recordFishRouteFailure("ocean-demo-vllm", "ocean_demo_vllm_backend_error");
  const health = getFishRouteHealth("ocean-demo-vllm");
  assert.equal(health.state, "degraded");
  assert.equal(health.lastErrorCode, "ocean_demo_vllm_backend_error");
});

test("a success after a failure recovers the route", () => {
  recordFishRouteFailure("ocean-demo-vllm", "ocean_demo_vllm_backend_error");
  recordFishRouteSuccess("ocean-demo-vllm");
  const health = getFishRouteHealth("ocean-demo-vllm");
  assert.equal(health.state, "ok");
  assert.equal(health.lastErrorCode, null);
});

test("failures age out of the degraded window", () => {
  recordFishRouteFailure("external-fallback", "external_chat_timeout");
  const sixMinutesLater = Date.now() + 6 * 60_000;
  assert.equal(getFishRouteHealth("external-fallback", sixMinutesLater).state, "ok");
});
