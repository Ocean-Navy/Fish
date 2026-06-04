#!/usr/bin/env node
import process from "node:process";

const DEFAULT_ENVS_URL = "https://api.oncompute.ai/envs";

const options = parseArgs(process.argv.slice(2));
const envsUrl = process.env.ONCOMPUTE_ENVS_URL || DEFAULT_ENVS_URL;
const payload = await fetchJson(envsUrl);
const rows = flattenEnvironments(payload).filter((row) => matchesFilters(row, options));
rows.sort(sortRows);

if (options.json) {
  console.log(JSON.stringify(rows.slice(0, options.limit), null, 2));
} else {
  printTable(rows.slice(0, options.limit));
}

function parseArgs(args) {
  const result = {
    chain: "",
    free: false,
    paid: false,
    gpu: "",
    json: false,
    limit: 20
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--chain") {
      result.chain = args[++index] || "";
    } else if (arg === "--free") {
      result.free = true;
    } else if (arg === "--paid") {
      result.paid = true;
    } else if (arg === "--gpu") {
      result.gpu = (args[++index] || "").toLowerCase();
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--limit") {
      const parsed = Number(args[++index]);
      result.limit = Number.isInteger(parsed) && parsed > 0 ? parsed : result.limit;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return result;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Oncompute env fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function flattenEnvironments(payload) {
  const nodes = Array.isArray(payload) ? payload : payload.envs || payload.nodes || [];
  const rows = [];
  for (const node of nodes) {
    const environments = node.computeEnvironments?.environments || node.environments || [];
    for (const env of environments) {
      const gpu = selectGpu(env.resources || []);
      const feeRows = flattenFees(env.fees || {});
      const free = Boolean(env.free);
      if (!feeRows.length) {
        rows.push(rowFor(node, env, gpu, free, null));
      }
      for (const fee of feeRows) {
        rows.push(rowFor(node, env, gpu, free, fee));
      }
    }
  }
  return rows;
}

function rowFor(node, env, gpu, free, fee) {
  return {
    node: node.friendlyName || node.id || "unknown-node",
    nodeId: node.id || null,
    nodeUrl: firstAddr(node),
    computeEnvId: env.id || null,
    free,
    chainId: fee?.chainId || null,
    feeToken: fee?.feeToken || null,
    totalPrice: fee?.totalPrice ?? null,
    prices: fee?.prices || [],
    gpu: gpu?.description || gpu?.id || null,
    gpuId: gpu?.id || null,
    gpuMemory: gpu?.memoryTotal || null,
    runningJobs: env.runningJobs ?? 0,
    queuedJobs: env.queuedJobs ?? 0,
    maxJobDuration: env.maxJobDuration ?? null,
    freeMaxJobDuration: env.free?.maxJobDuration ?? null
  };
}

function firstAddr(node) {
  return node.currentAddrs?.[0] || node.multiaddrs?.[0] || null;
}

function selectGpu(resources) {
  return (
    resources.find((resource) => resource.type === "gpu" && resource.platform === "nvidia") ||
    resources.find((resource) => resource.type === "gpu") ||
    null
  );
}

function flattenFees(fees) {
  const rows = [];
  for (const [chainId, feeRows] of Object.entries(fees)) {
    for (const fee of Array.isArray(feeRows) ? feeRows : []) {
      rows.push({
        chainId,
        feeToken: fee.feeToken || null,
        totalPrice: fee.total_price ?? fee.totalPrice ?? null,
        prices: fee.prices || []
      });
    }
  }
  return rows;
}

function matchesFilters(row, options) {
  if (options.chain && row.chainId !== options.chain) {
    return false;
  }
  if (options.free && !row.free) {
    return false;
  }
  if (options.paid && row.free) {
    return false;
  }
  if (options.gpu && !`${row.gpu || ""} ${row.gpuId || ""}`.toLowerCase().includes(options.gpu)) {
    return false;
  }
  return true;
}

function sortRows(a, b) {
  if (a.free !== b.free) {
    return a.free ? -1 : 1;
  }
  if ((a.queuedJobs || 0) !== (b.queuedJobs || 0)) {
    return (a.queuedJobs || 0) - (b.queuedJobs || 0);
  }
  return String(a.node).localeCompare(String(b.node));
}

function printTable(rows) {
  if (!rows.length) {
    console.log("No matching Oncompute environments found.");
    return;
  }
  const table = rows.map((row) => ({
    mode: row.free ? "free" : "paid",
    chain: row.chainId || "-",
    gpu: truncate(row.gpu || "-", 28),
    price: row.totalPrice === null ? "-" : String(row.totalPrice),
    node: truncate(row.node, 26),
    nodeUrl: truncate(row.nodeUrl || "-", 34),
    envId: truncate(row.computeEnvId || "-", 42)
  }));
  console.table(table);
  console.log("");
  console.log("For the adapter, copy nodeUrl to NODE_URL and envId to FISH_OCEAN_COMPUTE_ENV_ID.");
}

function truncate(value, length) {
  const text = String(value);
  return text.length <= length ? text : `${text.slice(0, length - 1)}...`;
}

function printHelp() {
  console.log(`Usage: node scripts/discover-oncompute-envs.mjs [options]

Options:
  --chain 8453       Only show one chain id
  --free             Only show environments with free capacity metadata
  --paid             Only show paid environments
  --gpu l40s         Filter by GPU name/id substring
  --json             Print full JSON rows
  --limit 20         Max rows to print
`);
}
