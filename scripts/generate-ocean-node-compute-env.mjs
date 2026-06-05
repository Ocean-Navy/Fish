#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const gpus = options.cpuOnly ? [] : detectNvidiaGpus();
const computeEnvironment = {
  id: options.environmentId,
  description: options.description,
  enableNetwork: false,
  resources: [
    {
      id: "disk",
      total: options.diskGb
    },
    ...gpus.map((gpu, index) => ({
      id: `${options.gpuIdPrefix}${index}`,
      description: gpu.name,
      type: "gpu",
      platform: "nvidia",
      total: 1,
      init: {
        deviceRequests: {
          Driver: "nvidia",
          DeviceIDs: [gpu.uuid],
          Capabilities: [["gpu"]]
        }
      },
      driverVersion: gpu.driverVersion,
      memoryTotal: gpu.memoryTotal
    }))
  ],
  storageExpiry: options.storageExpiry,
  maxJobDuration: options.maxJobDuration,
  minJobDuration: options.minJobDuration,
  free: {
    maxJobDuration: options.freeMaxJobDuration,
    minJobDuration: options.freeMinJobDuration,
    maxJobs: options.freeMaxJobs,
    access: {
      addresses: options.freeAccessAddresses,
      accessLists: []
    },
    resources: [
      { id: "cpu", max: options.freeCpu },
      { id: "ram", max: options.freeRamGb },
      { id: "disk", max: options.freeDiskGb },
      ...gpus.map((_, index) => ({ id: `${options.gpuIdPrefix}${index}`, max: options.freeGpu }))
    ],
    allowImageBuild: options.allowImageBuild
  }
};

const dockerCluster = {
  socketPath: "/var/run/docker.sock",
  scanImages: options.scanImages,
  imageRetentionDays: 3,
  imageCleanupInterval: 86400,
  environments: [computeEnvironment]
};

const json = options.pretty ? JSON.stringify([dockerCluster], null, 2) : JSON.stringify([dockerCluster]);
if (options.env) {
  console.log(`OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS='${json}'`);
} else {
  console.log(json);
}

function parseArgs(args) {
  const result = {
    cpuOnly: false,
    diskGb: 20,
    env: false,
    environmentId: "fish-local-free",
    description: "Fish local free compute",
    allowImageBuild: false,
    freeAccessAddresses: [],
    freeCpu: 1,
    freeDiskGb: 1,
    freeGpu: 1,
    freeMaxJobDuration: 300,
    freeMinJobDuration: 10,
    freeMaxJobs: 1,
    freeRamGb: 4,
    gpuIdPrefix: "fishGPU",
    maxJobDuration: 900,
    minJobDuration: 10,
    pretty: false,
    scanImages: true,
    storageExpiry: 604800
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cpu-only") {
      result.cpuOnly = true;
    } else if (arg === "--env") {
      result.env = true;
    } else if (arg === "--pretty") {
      result.pretty = true;
    } else if (arg === "--allow-image-build") {
      result.allowImageBuild = true;
    } else if (arg === "--free-access-address" || arg === "--free-access-addresses") {
      result.freeAccessAddresses.push(...readAddressList(args[++index] || ""));
    } else if (arg === "--no-scan") {
      result.scanImages = false;
    } else if (arg === "--disk-gb") {
      result.diskGb = readPositiveInt(args[++index], result.diskGb);
    } else if (arg === "--environment-id") {
      result.environmentId = sanitizeId(args[++index] || result.environmentId);
    } else if (arg === "--description") {
      result.description = String(args[++index] || result.description).trim() || result.description;
    } else if (arg === "--free-cpu") {
      result.freeCpu = readPositiveInt(args[++index], result.freeCpu);
    } else if (arg === "--free-ram-gb") {
      result.freeRamGb = readPositiveInt(args[++index], result.freeRamGb);
    } else if (arg === "--free-disk-gb") {
      result.freeDiskGb = readPositiveInt(args[++index], result.freeDiskGb);
    } else if (arg === "--free-gpu") {
      result.freeGpu = readPositiveInt(args[++index], result.freeGpu);
    } else if (arg === "--free-max-jobs") {
      result.freeMaxJobs = readPositiveInt(args[++index], result.freeMaxJobs);
    } else if (arg === "--free-max-job-duration") {
      result.freeMaxJobDuration = readPositiveInt(args[++index], result.freeMaxJobDuration);
    } else if (arg === "--max-job-duration") {
      result.maxJobDuration = readPositiveInt(args[++index], result.maxJobDuration);
    } else if (arg === "--gpu-id-prefix") {
      result.gpuIdPrefix = sanitizeId(args[++index] || result.gpuIdPrefix);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function detectNvidiaGpus() {
  try {
    const output = execFileSync(
      "nvidia-smi",
      ["--query-gpu=name,uuid,driver_version,memory.total", "--format=csv,noheader"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, uuid, driverVersion, memoryTotal] = line.split(",").map((part) => part.trim());
        return { name, uuid, driverVersion, memoryTotal };
      })
      .filter((gpu) => gpu.name && gpu.uuid);
  } catch {
    return [];
  }
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeId(value) {
  return value.replace(/[^A-Za-z0-9_-]/g, "") || "fishGPU";
}

function readAddressList(value) {
  return String(value)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address));
}

function printHelp() {
  console.log(`Usage: node scripts/generate-ocean-node-compute-env.mjs [options]

Prints a DOCKER_COMPUTE_ENVIRONMENTS JSON value for Ocean Node.
On NVIDIA hosts it reads GPU UUIDs from nvidia-smi. Without NVIDIA, it prints a CPU/disk free environment.

Options:
  --env                         Print OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS='...'
  --pretty                      Pretty-print JSON
  --cpu-only                    Do not include GPU resources
  --no-scan                     Set scanImages=false
  --allow-image-build           Allow free jobs to build local Docker images
  --free-access-address 0x...   Restrict free jobs to this wallet address; repeat or comma-separate
  --environment-id fish-local-free
                                Stable environment id suffix for Ocean Node
  --description "Fish local free compute"
                                Environment description
  --disk-gb 20                  Disk resource advertised to Ocean Node
  --free-cpu 1                  CPU max for free jobs
  --free-ram-gb 4               RAM max for free jobs
  --free-disk-gb 1              Disk max for free jobs
  --free-gpu 1                  GPU max per free job
  --free-max-jobs 1             Simultaneous free jobs
  --free-max-job-duration 300   Free job max duration seconds
  --max-job-duration 900        Environment max duration seconds
  --gpu-id-prefix fishGPU       Prefix for generated GPU resource ids
`);
}
