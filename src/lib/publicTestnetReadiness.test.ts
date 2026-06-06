import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

test("public testnet readiness treats paused paid checkout as manual", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const result = runReadiness(["--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const payments = summary.checks.find((check: { name: string }) => check.name === "Payments/mainnet checkout");

  assert.equal(summary.profile, "public-testnet");
  assert.equal(payments.state, "manual");
  assert.match(payments.findings.join("\n"), /do not block a no-real-money public testnet/);
});

test("paid mainnet readiness blocks while paid checkout is paused", async () => {
  const appEnv = await tempEnv("FISH_PAID_TOPUPS_PAUSED=true\n");
  const result = runReadiness(["--profile", "paid-mainnet", "--env", appEnv, "--ocean-env", missingOceanEnv(), "--json"]);

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  const payments = summary.checks.find((check: { name: string }) => check.name === "Payments/mainnet checkout");

  assert.equal(summary.profile, "paid-mainnet");
  assert.equal(payments.state, "blocked");
  assert.match(payments.findings.join("\n"), /paid checkout cannot launch/);
});

async function tempEnv(contents: string) {
  const dir = path.join(tmpdir(), `fish-readiness-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const file = path.join(dir, ".env.test");
  await writeFile(file, contents);
  return file;
}

function missingOceanEnv() {
  return path.join(tmpdir(), `fish-missing-ocean-env-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function runReadiness(args: string[]) {
  return spawnSync(process.execPath, ["scripts/audit-public-testnet-readiness.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}
