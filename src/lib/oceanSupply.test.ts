import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, test } from "node:test";
import { collectOceanData, publicComputeResource, publicOceanSummary } from "./oceanSupply";

const NODE_ENDPOINTS_PATH = "data/node_endpoints.txt";

let savedNodeEndpoints: string | null = null;
let hadNodeEndpoints = false;
let originalEnv: NodeJS.ProcessEnv | null = null;

afterEach(async () => {
  if (originalEnv) {
    process.env = originalEnv;
    originalEnv = null;
  }

  if (hadNodeEndpoints) {
    await writeFile(NODE_ENDPOINTS_PATH, savedNodeEndpoints ?? "", "utf8");
  } else {
    await rm(NODE_ENDPOINTS_PATH, { force: true });
  }
  savedNodeEndpoints = null;
  hadNodeEndpoints = false;
});

test("public Ocean responses redact operator-configured direct node endpoints", async () => {
  const privateEndpointPath = "/ocean-node/PRIVATE_TOKEN_123";
  const server = await useMockOceanServer(privateEndpointPath);
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await replaceNodeEndpoints(`${baseUrl}${privateEndpointPath}\n`);
    replaceOceanEnv(baseUrl);

    const data = await collectOceanData();
    const publicSummary = publicOceanSummary(data.summary);
    const publicResources = data.resources.map(publicComputeResource);
    const publicSummaryJson = JSON.stringify(publicSummary);
    const publicResourcesJson = JSON.stringify(publicResources);
    const privateEndpoint = `${baseUrl}${privateEndpointPath}`;

    assert.equal(data.resources.some((resource) => resource.nodeEndpoint === privateEndpoint), true);
    assert.equal(publicSummaryJson.includes(privateEndpoint), false);
    assert.equal(publicSummaryJson.includes(privateEndpointPath), false);
    assert.equal(publicResourcesJson.includes(privateEndpoint), false);
    assert.equal(publicResourcesJson.includes(privateEndpointPath), false);
    assert.equal(publicResources.some((resource) => "nodeEndpoint" in resource), false);
    assert.equal(publicResources.some((resource) => "raw" in resource), false);
  } finally {
    await server.close();
  }
});

async function replaceNodeEndpoints(contents: string) {
  hadNodeEndpoints = existsSync(NODE_ENDPOINTS_PATH);
  savedNodeEndpoints = hadNodeEndpoints ? await readFile(NODE_ENDPOINTS_PATH, "utf8") : null;
  await mkdir("data", { recursive: true });
  await writeFile(NODE_ENDPOINTS_PATH, contents, "utf8");
}

function replaceOceanEnv(baseUrl: string) {
  originalEnv = { ...process.env };
  process.env.ONCOMPUTE_NODES_URL = `${baseUrl}/nodes`;
  process.env.ONCOMPUTE_ENVS_URL = `${baseUrl}/envs`;
  process.env.ONCOMPUTE_STATS_URL = `${baseUrl}/stats`;
  process.env.ONCOMPUTE_MAX_PAGES = "1";
}

async function useMockOceanServer(privateEndpointPath: string): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("content-type", "application/json");

    if (url.pathname === "/nodes") {
      response.end(JSON.stringify({ nodes: [], pagination: { totalPages: 1 } }));
      return;
    }

    if (url.pathname === "/envs") {
      response.end(JSON.stringify({ envs: [], pagination: { totalPages: 1 } }));
      return;
    }

    if (url.pathname === "/stats") {
      response.end(JSON.stringify({ totalNetworkJobs: 0, totalBenchmarkJobs: 0, totalNetworkRevenue: 0 }));
      return;
    }

    if (url.pathname === `${privateEndpointPath}/api/services/computeEnvironments`) {
      response.end(JSON.stringify({
        environments: [
          {
            id: "private-env",
            resources: [
              { id: "nvidia-h200", type: "gpu", description: "NVIDIA H200", total: 1, inUse: 0 }
            ],
            fees: {},
            runningJobs: 0
          }
        ]
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
