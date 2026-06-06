#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultTemplate = path.join(
  repoRoot,
  "deploy/ocean-workload-adapter/algorithms/fish-document-summary/ocean-algorithm-metadata.template.json"
);
const defaultOutput = path.join(repoRoot, "data/ocean-workload-adapter/fish-document-summary.metadata.json");
const defaultAlgorithmPath = path.join(
  repoRoot,
  "deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py"
);
const algorithmRepoPath = "deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py";

const options = parseArgs(process.argv.slice(2));
const algorithmBytes = await readFile(options.algorithm, "utf8");
const algorithmSha256 = sha256Hex(algorithmBytes);
const algorithmUrl = options.url || process.env.FISH_ALGORITHM_FILE_URL?.trim() || defaultGitHubCommitUrl();
const chainId = readPositiveInt(options.chainId || process.env.FISH_ALGORITHM_CHAIN_ID);

assertImmutableAlgorithmUrl(algorithmUrl);

if (options.checkUrl) {
  await assertFetchable(algorithmUrl, algorithmSha256);
}

const template = JSON.parse(await readFile(options.template, "utf8"));
const algorithmFile = template.services[0].files.files[0];
algorithmFile.url = algorithmUrl;
algorithmFile.checksum = `sha256:${algorithmSha256}`;
if (chainId) {
  template.chainId = chainId;
}
template.metadata.created = new Date().toISOString();
template.metadata.updated = template.metadata.created;
template.metadata.additionalInformation = {
  ...(template.metadata.additionalInformation || {}),
  algorithmSource: {
    url: algorithmUrl,
    checksum: `sha256:${algorithmSha256}`,
    checksumAlgorithm: "sha256"
  }
};

await mkdir(path.dirname(options.output), { recursive: true });
await writeFile(options.output, JSON.stringify(template, null, 2) + "\n", "utf8");
console.log(options.output);

function parseArgs(args) {
  const result = {
    template: defaultTemplate,
    output: defaultOutput,
    algorithm: defaultAlgorithmPath,
    url: "",
    chainId: "",
    checkUrl: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--template") {
      result.template = path.resolve(args[++index] || "");
    } else if (arg === "--output") {
      result.output = path.resolve(args[++index] || "");
    } else if (arg === "--algorithm") {
      result.algorithm = path.resolve(args[++index] || "");
    } else if (arg === "--url") {
      result.url = args[++index] || "";
    } else if (arg === "--chain-id") {
      result.chainId = args[++index] || "";
    } else if (arg === "--check-url=false") {
      result.checkUrl = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

async function assertFetchable(url, expectedSha256) {
  const response = await fetch(url, { headers: { accept: "text/plain,*/*" } });
  if (!response.ok) {
    throw new Error(`Algorithm URL is not publicly fetchable: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text.includes("Fish Docs Bento Summary") || !text.includes("def main()")) {
    throw new Error("Algorithm URL is fetchable but does not look like fish-document-summary/algorithm.py");
  }
  const fetchedSha256 = sha256Hex(text);
  if (fetchedSha256 !== expectedSha256) {
    throw new Error(
      `Algorithm URL content sha256:${fetchedSha256} does not match reviewed local algorithm sha256:${expectedSha256}`
    );
  }
}

function assertImmutableAlgorithmUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname === "raw.githubusercontent.com") {
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const [owner, repo, ref, ...fileParts] = pathParts;
    const filePath = fileParts.join("/");
    if (owner !== "Ocean-Navy" || repo !== "Fish" || filePath !== algorithmRepoPath) {
      throw new Error(`Unsupported raw GitHub algorithm URL path: ${url}`);
    }
    if (!/^[a-f0-9]{40}$/i.test(ref || "")) {
      throw new Error(
        "FISH_ALGORITHM_FILE_URL must pin raw.githubusercontent.com URLs to a 40-character commit hash, not a branch or tag."
      );
    }
    return;
  }

  if (/^\/ipfs\/[A-Za-z0-9]+(?:\/|$)/.test(parsed.pathname)) {
    return;
  }

  throw new Error(
    "FISH_ALGORITHM_FILE_URL must be immutable: use the generated raw.githubusercontent.com commit URL or an IPFS gateway URL."
  );
}

function defaultGitHubCommitUrl() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  return `https://raw.githubusercontent.com/Ocean-Navy/Fish/${commit}/${algorithmRepoPath}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function printHelp() {
  console.log(`Usage: node scripts/prepare-fish-algorithm-metadata.mjs [--url <immutable-public-algorithm-url>]

Options:
  --url <url>             Immutable public algorithm.py URL. Defaults to the current Git commit raw URL.
  --algorithm <path>      Reviewed local algorithm.py path used for sha256 verification.
  --chain-id <id>         Override metadata chainId. Defaults to FISH_ALGORITHM_CHAIN_ID.
  --template <path>       Metadata template path.
  --output <path>         Prepared metadata output path.
  --check-url=false       Skip public URL fetch check.

Raw GitHub URLs must use a 40-character commit hash. Branch and tag URLs are rejected.
`);
}

function readPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
