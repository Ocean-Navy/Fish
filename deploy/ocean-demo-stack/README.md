# Fish Ocean Demo Stack

This stack is the GPU-VM side of the public testnet demo.

It packages:

- Ocean Node and Typesense;
- a Docker compute environment for free test jobs;
- the private Fish Ocean workload adapter behind `FISH_OCEAN_BATCH_ENDPOINT`;
- optional vLLM and Fish Runner for warm chat.

It is meant for a dedicated GPU VM. Do not run this stack on the small public web VM.

## What This Proves

Good public claim after a live smoke succeeds:

```text
Fish can run test dishes through an Ocean Node operated by Ocean Navy.
```

Do not claim this proves paid third-party Oncompute demand. For public copy, keep the source labels honest: local dry runs are `sample`, adapter-backed Ocean jobs are `snapshot` until the proof path is stronger, and only confirmed onchain/contract reads are `live`.

## Files

```text
deploy/ocean-demo-stack/docker-compose.yml  GPU-side Compose stack
deploy/ocean-demo-stack/env.example        Private env template
scripts/generate-ocean-node-compute-env.mjs
scripts/smoke-ocean-demo-stack.sh
```

## Prerequisites

- Ubuntu GPU VM with Docker Engine and Docker Compose plugin.
- NVIDIA driver and NVIDIA Container Toolkit if the warm vLLM profile or GPU Ocean jobs are enabled.
- Dedicated low-funds Ocean Node wallet.
- Dedicated low-funds Ocean proof wallet for the workload adapter.
- RPC URL for the chain used by Ocean CLI and the selected Ocean job path.
- The official Ocean CLI checkout prepared with `scripts/bootstrap-ocean-cli.sh` before live adapter mode.

Ocean Node mounts `/var/run/docker.sock` so it can launch compute containers. Treat this as a high-trust, dedicated host.

## Configure

From the repo root:

```bash
cp deploy/ocean-demo-stack/env.example .env.ocean-demo-stack
node scripts/generate-ocean-node-compute-env.mjs --env
```

Paste the printed `OCEAN_NODE_DOCKER_COMPUTE_ENVIRONMENTS=...` value into `.env.ocean-demo-stack`.

Edit at least:

```text
TYPESENSE_API_KEY
OCEAN_NODE_PRIVATE_KEY
OCEAN_NODE_ALLOWED_ADMINS
OCEAN_NODE_JWT_SECRET
OCEAN_NODE_P2P_ANNOUNCE_ADDRESSES
OCEAN_WORKLOAD_ADAPTER_API_KEY
OCEAN_PROOF_PRIVATE_KEY or OCEAN_PROOF_MNEMONIC
OCEAN_PROOF_RPC
```

For a private first test, keep these endpoints bound to localhost:

```text
OCEAN_NODE_HTTP_BIND=127.0.0.1
OCEAN_WORKLOAD_ADAPTER_BIND=127.0.0.1
FISH_VLLM_BIND=127.0.0.1
FISH_RUNNER_BIND=127.0.0.1
```

Expose only through a private network, WireGuard, SSH tunnel, cloud private IP, or nginx allowlist when connecting the public web VM.

## Start Ocean Node And Adapter

```bash
docker compose \
  -f deploy/ocean-demo-stack/docker-compose.yml \
  --env-file .env.ocean-demo-stack \
  up -d ocean-typesense ocean-node ocean-workload-adapter
```

Check:

```bash
curl -fsS http://127.0.0.1:8000/api/services/computeEnvironments | jq
curl -fsS http://127.0.0.1:8787/healthz | jq
```

Dry-run mode is expected until Ocean CLI, algorithm DID, and compute environment ID are configured.

## Start Warm Chat Profile

The warm profile adds vLLM and Fish Runner:

```bash
docker compose \
  -f deploy/ocean-demo-stack/docker-compose.yml \
  --env-file .env.ocean-demo-stack \
  --profile warm \
  up -d
```

Check:

```bash
scripts/smoke-vllm-openai-compatible.sh
scripts/smoke-fish-runner.sh
```

If those scripts run from the host, export:

```text
FISH_VLLM_BASE_URL=http://127.0.0.1:8000/v1
FISH_VLLM_API_KEY=<FISH_VLLM_API_KEY>
FISH_VLLM_MODEL=<FISH_VLLM_SERVED_MODEL_NAME>
FISH_RUNNER_BASE_URL=http://127.0.0.1:8088
FISH_RUNNER_API_KEY=<FISH_RUNNER_API_KEY>
```

## Live Ocean Dish Path

The adapter is live only when this health payload says `liveReady: true`:

```bash
curl -fsS http://127.0.0.1:8787/healthz | jq
```

Required live values:

```text
OCEAN_WORKLOAD_ADAPTER_MODE=live
OCEAN_PROOF_PRIVATE_KEY or OCEAN_PROOF_MNEMONIC
OCEAN_PROOF_RPC
NODE_URL=http://ocean-node:8000
FISH_OCEAN_DATASET_DIDS=[]
FISH_OCEAN_ALGO_DID=did:op:...
FISH_OCEAN_COMPUTE_ENV_ID=<id from /api/services/computeEnvironments>
OCEAN_CLI_DIR=/ocean-cli
```

Use `startFreeCompute` first. Leave these empty for free test jobs:

```text
FISH_OCEAN_PAYMENT_TOKEN=
FISH_OCEAN_RESOURCES=
```

The prepared first algorithm bundle is:

```text
deploy/ocean-workload-adapter/algorithms/fish-document-summary/
```

Publish it after the Ocean CLI checkout is prepared and the algorithm file is publicly reachable.

## Smoke

With the stack running:

```bash
scripts/smoke-ocean-demo-stack.sh .env.ocean-demo-stack
```

The script validates Compose config, checks Ocean compute environments, checks adapter health, submits an adapter smoke job, and checks Fish Runner if the warm profile is running.

## Point The Web VM At The GPU Stack

On the public Fish web VM:

```text
FISH_OCEAN_BATCH_ENDPOINT=http://<private-gpu-vm-host>:8787/jobs
FISH_OCEAN_BATCH_API_KEY=<OCEAN_WORKLOAD_ADAPTER_API_KEY>
FISH_OCEAN_BATCH_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_BATCH_DAILY_BUDGET_USD=5

FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<private-gpu-vm-host>:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<FISH_RUNNER_API_KEY>
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS=<operator estimate>
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=<small cap>
```

Do not expose raw vLLM publicly. Fish Gateway should call Fish Runner, not vLLM.

## Shutdown

```bash
docker compose \
  -f deploy/ocean-demo-stack/docker-compose.yml \
  --env-file .env.ocean-demo-stack \
  --profile warm \
  down
```

Add `-v` only when you intentionally want to delete Typesense, Ocean Node, adapter, and model-cache volumes.
