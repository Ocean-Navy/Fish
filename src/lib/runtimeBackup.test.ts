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

test("runtime backup dry run includes legacy form JSONL storage", async () => {
  const dir = path.join(tmpdir(), `fish-runtime-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const dataDir = path.join(dir, "data");
  tempDirs.push(dir);

  await mkdir(path.join(dataDir, "forms"), { recursive: true });
  await writeFile(path.join(dataDir, "forms", "waitlist.jsonl"), "{\"ok\":true}\n");

  const result = spawnSync(process.execPath, ["scripts/backup-runtime-data.mjs", "--dry-run", "--json", "--data-dir", dataDir], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);
  const forms = manifest.paths.find((entry: { path: string }) => entry.path.endsWith("/data/forms"));

  assert.ok(forms);
  assert.equal(forms.exists, true);
  assert.equal(forms.files, 1);
});

test("runtime backup dry run flags public output targets as unsafe", async () => {
  const dir = path.join(tmpdir(), `fish-runtime-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const dataDir = path.join(dir, "data");
  tempDirs.push(dir);

  await mkdir(path.join(dataDir, "forms"), { recursive: true });
  await writeFile(path.join(dataDir, "forms", "waitlist.jsonl"), "{\"ok\":true}\n");

  const result = spawnSync(process.execPath, ["scripts/backup-runtime-data.mjs", "--dry-run", "--json", "--data-dir", dataDir, "--output-dir", "public/backups"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);

  assert.equal(manifest.backupTarget.ok, false);
  assert.match(manifest.backupTarget.failures.join("\n"), /must not be inside public/);
});

test("runtime backup refuses to write archives into public output targets", async () => {
  const dir = path.join(tmpdir(), `fish-runtime-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const dataDir = path.join(dir, "data");
  tempDirs.push(dir);

  await mkdir(path.join(dataDir, "forms"), { recursive: true });
  await writeFile(path.join(dataDir, "forms", "waitlist.jsonl"), "{\"ok\":true}\n");

  const result = spawnSync(process.execPath, ["scripts/backup-runtime-data.mjs", "--data-dir", dataDir, "--output-dir", "public/backups"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsafe backup target/);
});
