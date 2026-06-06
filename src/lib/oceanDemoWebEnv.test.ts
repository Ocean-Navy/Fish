import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

test("Ocean demo web env generator maps warm stack settings to web env", async () => {
  const envPath = await tempOceanEnv({
    OCEAN_WORKLOAD_ADAPTER_API_KEY: "adapter-key-12345678901234567890",
    OCEAN_WORKLOAD_ADAPTER_PORT: "8877",
    FISH_RUNNER_API_KEY: "runner-key-12345678901234567890",
    FISH_RUNNER_PORT: "8181",
    FISH_RUNNER_PROVIDER_ID: "ocean-demo-provider",
    FISH_VLLM_SERVED_MODEL_NAME: "fish-warm-chat",
    FISH_RUNNER_SIGNING_KEY_ID: "runner-test-key",
    FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM: ed25519PrivatePem()
  });

  const result = runWebEnv(["--env", envPath, "--host", "10.0.0.7", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.appEnv.FISH_OCEAN_BATCH_ENDPOINT, "http://10.0.0.7:8877/jobs");
  assert.equal(payload.appEnv.FISH_OCEAN_BATCH_API_KEY, "adapter-key-12345678901234567890");
  assert.equal(payload.appEnv.FISH_OCEAN_BATCH_PROVIDER_ID, "ocean-demo-provider");
  assert.equal(payload.appEnv.FISH_OCEAN_BATCH_PRIVATE_PAYLOAD, "true");
  assert.equal(payload.appEnv.FISH_CHAT_ROUTE, "ocean-first");
  assert.equal(payload.appEnv.FISH_OCEAN_DEMO_VLLM_BASE_URL, "http://10.0.0.7:8181/v1");
  assert.equal(payload.appEnv.FISH_OCEAN_DEMO_VLLM_API_KEY, "runner-key-12345678901234567890");
  assert.equal(payload.appEnv.FISH_OCEAN_DEMO_VLLM_MODEL, "fish-warm-chat");
  assert.equal(payload.appEnv.FISH_RUNNER_PUBLIC_KEY_ID, "runner-test-key");
  assert.match(payload.appEnv.FISH_RUNNER_PUBLIC_KEY_PEM, /BEGIN PUBLIC KEY/);
  assert.deepEqual(payload.findings, []);
});

test("Ocean demo web env generator supports the MLX profile", async () => {
  const envPath = await tempOceanEnv({
    OCEAN_WORKLOAD_ADAPTER_API_KEY: "adapter-key-12345678901234567890",
    FISH_RUNNER_API_KEY: "runner-key-12345678901234567890",
    FISH_MLX_MODEL: "mlx-community/Test-4bit"
  });

  const result = runWebEnv(["--env", envPath, "--host", "fish-ocean.private", "--profile", "mlx", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.profile, "mlx");
  assert.equal(payload.appEnv.FISH_OCEAN_BATCH_PROVIDER_ID, "ocean-navy-local-mlx");
  assert.equal(payload.appEnv.FISH_OCEAN_DEMO_PROVIDER_ID, "ocean-navy-local-mlx");
  assert.equal(payload.appEnv.FISH_OCEAN_DEMO_VLLM_MODEL, "mlx-community/Test-4bit");
});

test("Ocean demo web env generator warns about local host and weak keys", async () => {
  const envPath = await tempOceanEnv({
    OCEAN_WORKLOAD_ADAPTER_API_KEY: "change-me-adapter-key",
    FISH_RUNNER_API_KEY: "change-me-runner-key",
    OCEAN_WORKLOAD_ADAPTER_BIND: "0.0.0.0"
  });

  const result = runWebEnv(["--env", envPath, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.match(payload.findings.join("\n"), /Host is local/);
  assert.match(payload.findings.join("\n"), /OCEAN_WORKLOAD_ADAPTER_API_KEY is missing or weak/);
  assert.match(payload.findings.join("\n"), /FISH_RUNNER_API_KEY is missing or weak/);
  assert.match(payload.findings.join("\n"), /OCEAN_WORKLOAD_ADAPTER_BIND is public/);
});

async function tempOceanEnv(values: Record<string, string>) {
  const dir = path.join(tmpdir(), `fish-ocean-web-env-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  const envPath = path.join(dir, ".env.ocean-demo-stack");
  await writeFile(envPath, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"));
  return envPath;
}

function ed25519PrivatePem() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString().replaceAll("\n", "\\n");
}

function runWebEnv(args: string[]) {
  return spawnSync(process.execPath, ["scripts/print-ocean-demo-web-env.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}
