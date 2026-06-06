#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const contractsDir = path.resolve(__dirname, "..");
const image = process.env.SLITHER_DOCKER_IMAGE || "trailofbits/eth-security-toolbox:latest";
const nodeModulesVolume = process.env.SLITHER_DOCKER_NODE_MODULES_VOLUME || "opfish-slither-node-modules";
const platform = process.env.SLITHER_DOCKER_PLATFORM || "linux/amd64";

const dockerArgs = [
  "run",
  "--rm",
  "--platform",
  platform,
  "-v",
  `${contractsDir}:/workspace`,
  "-v",
  `${nodeModulesVolume}:/workspace/node_modules`,
  "-w",
  "/workspace",
  image,
  "bash",
  "-lc",
  'npm ci && slither . --exclude-dependencies --filter-paths "node_modules|artifacts|cache|deployments"'
];

const result = spawnSync("docker", dockerArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
