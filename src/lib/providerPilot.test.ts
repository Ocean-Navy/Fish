import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

let activeTempDir: string | null = null;
const originalCwd = process.cwd();
const PROVIDER_ENV_KEYS = ["FISH_PROVIDER_ALLOWLIST", "FISH_PROVIDER_JOB_ENDPOINTS"] as const;

afterEach(async () => {
  process.chdir(originalCwd);
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key];
  }
  if (activeTempDir) {
    await rm(activeTempDir, { force: true, recursive: true });
    activeTempDir = null;
  }
});

test("allowlist-only providers resolve their configured job endpoint", async () => {
  const tempDir = await useTempFishDataDir();
  process.chdir(tempDir);
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key];
  }

  await writeFile(
    path.join(tempDir, "data", "provider_allowlist.json"),
    JSON.stringify({
      providers: [
        {
          providerId: "prov_allowlist_only",
          nodeEndpoint: "https://node.example.invalid",
          jobEndpoint: "https://provider.example.invalid/jobs",
          allowedWorkloadTypes: ["chat_batch"],
          allowedModels: ["fish-demo-chat"],
          operatorOwner: "test",
          decisionReason: "direct-seeded provider"
        }
      ]
    })
  );

  const { collectProviderPilotRegistry, isProviderAllowed, resolveProviderJobEndpoint } = await import("./providerPilot");

  const registry = await collectProviderPilotRegistry();
  const endpoint = await resolveProviderJobEndpoint("prov_allowlist_only");

  assert.equal(registry.providers.some((provider) => provider.providerId === "prov_allowlist_only"), true);
  assert.equal(isProviderAllowed(registry, "prov_allowlist_only", "chat_batch", "fish-demo-chat"), true);
  assert.equal(endpoint, "https://provider.example.invalid/jobs");
});

async function useTempFishDataDir() {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-provider-pilot-"));
  await mkdir(path.join(activeTempDir, "data"), { recursive: true });
  return activeTempDir;
}
