#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const algorithmPath = path.join(repoRoot, "deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py");
const python = process.env.PYTHON || "python3";

const noDataset = runCase("no-dataset", null);
assert.equal(noDataset.output.mode, "no_dataset_proof");
assert.equal(noDataset.output.source.inputFileCount, 0);
assert.equal(noDataset.proof.storesPromptOutputText, false);
assert.equal(noDataset.proof.outputHash, noDataset.output.outputHash);
assert.equal(noDataset.summary.trim().length > 0, true);

const datasetText = [
  "Fish turns Ocean Network compute into simple AI meals.",
  "Users ask for a dish and receive a clear answer.",
  "Builders call an API while Fish handles routing behind the counter.",
  "Providers bring GPUs and holders stake OCEAN for future utility."
].join(" ");
const withDataset = runCase("with-dataset", datasetText);
assert.equal(withDataset.output.mode, "dataset_summary");
assert.equal(withDataset.output.source.inputFileCount, 1);
assert.equal(withDataset.output.documents.length, 1);
assert.equal(withDataset.output.documents[0].sha256, sha256Hex(datasetText));
assert.equal(withDataset.proof.storesPromptOutputText, false);
assert.equal(withDataset.proof.outputHash, withDataset.output.outputHash);
assert.equal(withDataset.summary.trim().length > 0, true);

console.log("Fish document summary algorithm smoke passed");
console.log(`no-dataset outputHash: ${noDataset.output.outputHash}`);
console.log(`dataset outputHash: ${withDataset.output.outputHash}`);

function runCase(name, inputText) {
  const dir = mkdtempSync(path.join(tmpdir(), `fish-algorithm-${name}-`));
  try {
    const inputDir = path.join(dir, "inputs");
    const outputDir = path.join(dir, "out");
    mkdirSync(inputDir, { recursive: true });
    if (inputText !== null) {
      writeFileSync(path.join(inputDir, "demo.txt"), inputText, "utf8");
    }

    const result = spawnSync(python, [algorithmPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        FISH_ALGO_INPUT_DIRS: inputText === null ? path.join(dir, "missing") : inputDir,
        FISH_ALGO_OUTPUT_DIR: outputDir
      }
    });
    if (result.status !== 0) {
      throw new Error(`algorithm ${name} failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }

    const output = readJson(path.join(outputDir, "fish-document-summary.json"));
    const proof = readJson(path.join(outputDir, "fish-proof-receipt.json"));
    const summary = readFileSync(path.join(outputDir, "summary.txt"), "utf8");
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.algorithm, "fish-document-summary");
    assert.equal(output.taskType, "document_summary");
    assert.equal(output.outputHash, expectedOutputHash(output));
    assert.equal(proof.algorithm, output.algorithm);
    assert.equal(proof.algorithmVersion, output.algorithmVersion);
    assert.equal(proof.taskType, output.taskType);
    assert.equal(proof.mode, output.mode);
    return { output, proof, summary };
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function expectedOutputHash(output) {
  const withoutHash = { ...output };
  delete withoutHash.outputHash;
  return `sha256:${sha256Hex(canonicalJson(withoutHash))}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
