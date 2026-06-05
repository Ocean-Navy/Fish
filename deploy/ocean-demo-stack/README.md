# Fish Ocean Demo Stack

This stack is the GPU-side of the public testnet demo. On NVIDIA hosts it can run vLLM inside Docker. On Apple Silicon Macs, run MLX on the macOS host and run Fish Runner in Docker against `host.docker.internal`.

It packages:

- Ocean Node and Typesense;
- a Docker compute environment for free test jobs;
- the private Fish Ocean workload adapter behind `FISH_OCEAN_BATCH_ENDPOINT`;
- optional vLLM and Fish Runner for warm chat;
- optional host-MLX Fish Runner profile for Apple Silicon local testing.

It is meant for a dedicated GPU VM or a local high-memory Apple Silicon test machine. Do not run this stack on the small public web VM.

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

- Docker Engine and Docker Compose plugin.
- NVIDIA driver and NVIDIA Container Toolkit if the warm vLLM profile or GPU Ocean jobs are enabled.
- On Apple Silicon, `mlx-lm` installed on the macOS host if the `mlx` profile is used.
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

For a private demo, restrict free compute to the Ocean proof wallet that the workload adapter signs with:

```bash
node scripts/generate-ocean-node-compute-env.mjs \
  --free-access-address 0xYourProofWallet \
  --env
```

For Apple Silicon/local CPU proof runs through `local_ocean_node` mode, generate the environment with local image builds enabled:

```bash
node scripts/generate-ocean-node-compute-env.mjs \
  --cpu-only \
  --allow-image-build \
  --free-access-address 0xYourProofWallet \
  --env
```

Keep this for a private local demo only. Free image builds let Ocean Node build the tiny proof algorithm image on the host; they should stay disabled for public third-party free compute unless the node is intentionally hardened for that use. `free.access.addresses` should not be empty on a public or private test node unless the node is intentionally offering free jobs to everyone.

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

The chain behind `OCEAN_PROOF_RPC` must be supported by the Ocean CLI contract address bundle, or `ADDRESS_FILE` must point at a custom Ocean contracts address file. The bundled Ocean CLI 2.0.0 addresses include Base mainnet (`8453`) but not Base Sepolia (`84532`). For Base Sepolia tests, first obtain the Ocean contract addresses for that chain and set `ADDRESS_FILE`; otherwise use a supported testnet or Base mainnet.

For a private first test, keep these endpoints bound to localhost:

```text
OCEAN_NODE_HTTP_BIND=127.0.0.1
OCEAN_NODE_P2P_BIND=127.0.0.1
OCEAN_WORKLOAD_ADAPTER_BIND=127.0.0.1
FISH_VLLM_BIND=127.0.0.1
FISH_RUNNER_BIND=127.0.0.1
FISH_MLX_BASE_URL=http://host.docker.internal:8080/v1
```

Only change `OCEAN_NODE_P2P_BIND` to a public or private-network interface when the node is intentionally joining a reachable P2P network. For the local proof stack, keep it on localhost.

The template stores Ocean Node localfs payloads under `/tmp/ocean-node-persistent-storage` inside the container. This is intentionally local-demo friendly because Docker Desktop named volumes mounted under `/data` can be unwritable for the Ocean Node process. For a persistent production node, set `OCEAN_NODE_PERSISTENT_STORAGE` to a writable mounted path and verify the node stays up before exposing it.

Expose only through a private network, WireGuard, SSH tunnel, cloud private IP, or nginx allowlist when connecting the public web VM.

The free compute guard is layered:

```text
free.access.addresses=<only the Ocean proof wallet address>
OCEAN_NODE_HTTP_BIND=127.0.0.1 or private network only
OCEAN_NODE_P2P_BIND=127.0.0.1 or intentionally selected P2P interface only
OCEAN_WORKLOAD_ADAPTER_API_KEY=<secret>
OCEAN_WORKLOAD_ADAPTER_BIND=127.0.0.1 or private network only
```

Do not publish the Ocean Node HTTP API or workload adapter directly to the internet for the demo stack.

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

The `warm` profile adds NVIDIA vLLM and Fish Runner:

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

## Apple Silicon MLX Profile

Docker on macOS does not expose the Apple GPU/Metal runtime to Linux containers in the same way NVIDIA Container Toolkit exposes CUDA GPUs. For an M-series Mac, run MLX on the host and let Dockerized Fish Runner call it through `host.docker.internal`.

Install and start MLX on the macOS host:

```bash
python3 -m venv .venv-mlx
source .venv-mlx/bin/activate
pip install -U mlx-lm
mlx_lm.server \
  --model mlx-community/Llama-3.2-3B-Instruct-4bit \
  --host 127.0.0.1 \
  --port 8080
```

Smoke the host MLX server:

```bash
FISH_MLX_BASE_URL=http://127.0.0.1:8080/v1 \
FISH_MLX_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit \
scripts/smoke-mlx-openai-compatible.sh
```

Start Ocean Node, adapter, and Fish Runner for MLX:

```bash
make ocean-demo-up-mlx FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

Point the local website at the runner:

```text
FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://127.0.0.1:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<FISH_RUNNER_API_KEY>
FISH_OCEAN_DEMO_VLLM_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-local-mlx
```

This tests Fish web, Fish Runner receipts, local Apple Silicon inference, Ocean Node startup, and adapter wiring. It does not test NVIDIA vLLM behavior or GPU access inside Ocean compute containers.

## Local Ocean Node Dish Path

This mode lets Fish validate the stack against our own Ocean Node before renting a GPU server or paying external Oncompute providers:

```text
OCEAN_WORKLOAD_ADAPTER_MODE=local_ocean_node
OCEAN_PROOF_PRIVATE_KEY or OCEAN_PROOF_MNEMONIC
NODE_URL=http://ocean-node:8000
FISH_OCEAN_COMPUTE_ENV_ID=<id from /api/services/computeEnvironments>
OCEAN_CLI_DIR=/ocean-cli
FISH_OCEAN_LOCAL_BASE_IMAGE=python:3.11-slim
```

`local_ocean_node` uses Ocean Node's signed `/api/services/freeCompute`, `/api/services/compute`, and `/api/services/computeResult` APIs directly. It runs a tiny raw-code Python proof in an Ocean C2D container and returns the output tar hash to Fish. This is a real local Ocean Node compute job, not a sample adapter, but it is still conservative proof: it does not prove paid external Oncompute demand or GPU inference.

The Ocean proof wallet address must be present in the selected compute environment's `free.access.addresses`; otherwise the adapter should not be able to start a free job.

## Live Ocean CLI Dish Path

The adapter is live only when this health payload says `liveReady: true`:

```bash
curl -fsS http://127.0.0.1:8787/healthz | jq
```

Required live values:

```text
OCEAN_WORKLOAD_ADAPTER_MODE=live
OCEAN_PROOF_PRIVATE_KEY or OCEAN_PROOF_MNEMONIC
OCEAN_PROOF_RPC
ADDRESS_FILE=<optional custom Ocean contracts address file>
NODE_URL=http://ocean-node:8000
FISH_OCEAN_DATASET_DIDS=[]
FISH_OCEAN_ALGO_DID=did:op:...
FISH_OCEAN_COMPUTE_ENV_ID=<id from /api/services/computeEnvironments>
OCEAN_CLI_DIR=/ocean-cli
AVOID_LOOP_RUN=true
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
FISH_OCEAN_BATCH_PRIVATE_PAYLOAD=true

FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<private-gpu-vm-host>:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<FISH_RUNNER_API_KEY>
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS=<operator estimate>
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=<small cap>
```

`FISH_OCEAN_BATCH_PRIVATE_PAYLOAD=true` makes batch dishes useful by sending short order text to the private adapter so the Ocean job can write a returned Markdown/HTML artifact. Use it only when the adapter and Ocean Node are private and operated by us. Public proof still stores tickets and hashes, not raw order text.

Do not expose raw vLLM or raw MLX publicly. Fish Gateway should call Fish Runner, not the model server.

## Shutdown

```bash
docker compose \
  -f deploy/ocean-demo-stack/docker-compose.yml \
  --env-file .env.ocean-demo-stack \
  --profile warm \
  --profile mlx \
  down
```

Add `-v` only when you intentionally want to delete Typesense, Ocean Node, adapter, and model-cache volumes.
