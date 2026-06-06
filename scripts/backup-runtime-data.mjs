#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const runtimePaths = ["data/submissions", "data/fish", "data/ocean-batch", "data/proof", "data/staking"];
const dataDir = option("--data-dir") || "data";
const outputDir = option("--output-dir") || process.env.FISH_DATA_BACKUP_TARGET || "backups";
const dryRun = hasFlag("--dry-run");
const json = hasFlag("--json");
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const archivePath = path.resolve(outputDir, `fish-runtime-data-${timestamp}.tar.gz`);
const root = process.cwd();

const entries = runtimePaths.map((runtimePath) => inspectPath(runtimePath.replace(/^data\b/, dataDir)));
const manifest = {
  createdAt: new Date().toISOString(),
  dataDir,
  outputDir,
  dryRun,
  includesSensitiveOperatorData: true,
  warning: "Archive may include API ledgers, proof signing keys, wallet intent rows, provider payout rows, and user submissions. Keep it private.",
  paths: entries
};

if (!dryRun) {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const existingPaths = entries.filter((entry) => entry.exists).map((entry) => entry.path);
  if (!existingPaths.length) {
    fail("No runtime data paths exist; nothing to back up.");
  }
  execFileSync("tar", ["-czf", archivePath, ...existingPaths], { cwd: root, stdio: "ignore" });
  chmodSync(archivePath, 0o600);
  manifest.archive = {
    path: archivePath,
    sha256: sha256File(archivePath),
    sizeBytes: statSync(archivePath).size
  };
  manifest.manifestPath = `${archivePath}.manifest.json`;
  writeFileSync(manifest.manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  chmodSync(manifest.manifestPath, 0o600);
}

if (json) {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  printManifest(manifest);
}

function inspectPath(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!existsSync(absolutePath)) {
    return { path: relativePath, exists: false, files: 0, directories: 0, bytes: 0 };
  }
  return { path: relativePath, exists: true, ...walk(absolutePath) };
}

function walk(absolutePath) {
  const stats = statSync(absolutePath);
  if (stats.isFile()) {
    return { files: 1, directories: 0, bytes: stats.size };
  }
  if (!stats.isDirectory()) {
    return { files: 0, directories: 0, bytes: 0 };
  }
  let files = 0;
  let directories = 1;
  let bytes = 0;
  for (const name of readdirSync(absolutePath)) {
    const child = walk(path.join(absolutePath, name));
    files += child.files;
    directories += child.directories;
    bytes += child.bytes;
  }
  return { files, directories, bytes };
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function printManifest(summary) {
  console.log(`Fish runtime backup${summary.dryRun ? " dry run" : ""}`);
  console.log(`data dir: ${summary.dataDir}`);
  console.log(`output: ${summary.outputDir}`);
  console.log("");
  for (const entry of summary.paths) {
    const state = entry.exists ? "found" : "missing";
    console.log(`${state.padEnd(7)} ${entry.path} files=${entry.files} dirs=${entry.directories} bytes=${entry.bytes}`);
  }
  if (summary.archive) {
    console.log("");
    console.log(`archive:  ${summary.archive.path}`);
    console.log(`sha256:   ${summary.archive.sha256}`);
    console.log(`bytes:    ${summary.archive.sizeBytes}`);
    console.log(`manifest: ${summary.manifestPath}`);
  }
  console.log("");
  console.log("Keep this archive private. It may include operator ledgers, proof signing keys, and user submissions.");
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
