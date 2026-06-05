#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultTemplate = path.join(
  repoRoot,
  "deploy/ocean-workload-adapter/algorithms/fish-document-summary/ocean-algorithm-metadata.template.json"
);
const defaultOutput = path.join(repoRoot, "data/ocean-workload-adapter/fish-document-summary.metadata.json");

const options = parseArgs(process.argv.slice(2));
const algorithmUrl = options.url || process.env.FISH_ALGORITHM_FILE_URL?.trim();

if (!algorithmUrl) {
  console.error("FISH_ALGORITHM_FILE_URL is required.");
  console.error("");
  console.error("It must be a public URL an Ocean node can fetch. Options:");
  console.error("- make the Fish repo public and use a raw.githubusercontent.com URL");
  console.error("- publish algorithm.py as a public release asset");
  console.error("- upload algorithm.py to IPFS or another public file URL");
  console.error("");
  console.error("Example after public main merge:");
  console.error(
    "FISH_ALGORITHM_FILE_URL=https://raw.githubusercontent.com/Ocean-Navy/Fish/main/deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py"
  );
  process.exit(1);
}

if (options.checkUrl) {
  await assertFetchable(algorithmUrl);
}

const template = JSON.parse(await readFile(options.template, "utf8"));
template.services[0].files.files[0].url = algorithmUrl;
template.metadata.created = new Date().toISOString();
template.metadata.updated = template.metadata.created;

await mkdir(path.dirname(options.output), { recursive: true });
await writeFile(options.output, JSON.stringify(template, null, 2) + "\n", "utf8");
console.log(options.output);

function parseArgs(args) {
  const result = {
    template: defaultTemplate,
    output: defaultOutput,
    url: "",
    checkUrl: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--template") {
      result.template = path.resolve(args[++index] || "");
    } else if (arg === "--output") {
      result.output = path.resolve(args[++index] || "");
    } else if (arg === "--url") {
      result.url = args[++index] || "";
    } else if (arg === "--check-url=false") {
      result.checkUrl = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

async function assertFetchable(url) {
  const response = await fetch(url, { headers: { accept: "text/plain,*/*" } });
  if (!response.ok) {
    throw new Error(`Algorithm URL is not publicly fetchable: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text.includes("Fish Docs Bento Summary") || !text.includes("def main()")) {
    throw new Error("Algorithm URL is fetchable but does not look like fish-document-summary/algorithm.py");
  }
}

function printHelp() {
  console.log(`Usage: node scripts/prepare-fish-algorithm-metadata.mjs --url <public-algorithm-url>

Options:
  --url <url>             Public algorithm.py URL. Defaults to FISH_ALGORITHM_FILE_URL.
  --template <path>       Metadata template path.
  --output <path>         Prepared metadata output path.
  --check-url=false       Skip public URL fetch check.
`);
}
