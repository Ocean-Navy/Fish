#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const strict = process.argv.includes("--strict");
const contractsDir = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: contractsDir,
    stdio: "inherit",
    ...options
  });
}

const slitherVersion = run("slither", ["--version"], { stdio: "pipe" });
if (slitherVersion.status !== 0) {
  const message = [
    "Slither is not installed or is not on PATH.",
    "Install it with `python3 -m pip install slither-analyzer` or use a Slither container, then rerun:",
    "  npm --prefix contracts run security:static:strict"
  ].join("\n");

  if (strict) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message}\nSkipping optional static analysis in non-strict mode.`);
  process.exit(0);
}

const result = run("slither", [
  ".",
  "--exclude-dependencies",
  "--filter-paths",
  "node_modules|artifacts|cache|deployments"
]);

process.exit(result.status ?? 1);
