import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

const originalCwd = process.cwd();
let activeTempDir: string | null = null;

afterEach(async () => {
  process.chdir(originalCwd);
  if (activeTempDir) {
    await rm(activeTempDir, { recursive: true, force: true });
    activeTempDir = null;
  }
});

test("provider pilot public registry omits operator allowlist decision metadata", async () => {
  activeTempDir = await mkdtemp(path.join(tmpdir(), "fish-provider-registry-"));
  process.chdir(activeTempDir);
  await mkdir(path.join(activeTempDir, "data"), { recursive: true });
  await writeFile(
    path.join(activeTempDir, "data", "provider_allowlist.json"),
    JSON.stringify({
      providers: [
        {
          providerId: "provider_redacted",
          allowedWorkloadTypes: ["chat_batch"],
          allowedModels: ["fish-demo-chat"],
          operatorOwner: "private-operator",
          decisionReason: "private decision note"
        }
      ]
    })
  );

  const { collectProviderPilotRegistry } = await import(`./providerPilot.ts?registry=${Date.now()}`);
  const registry = await collectProviderPilotRegistry();
  const allowlist = registry.allowlist[0] as Record<string, unknown>;

  assert.equal(registry.allowlist.length, 1);
  assert.equal(allowlist.providerId, "provider_redacted");
  assert.equal(allowlist.operatorOwner, undefined);
  assert.equal(allowlist.decisionReason, undefined);
});
