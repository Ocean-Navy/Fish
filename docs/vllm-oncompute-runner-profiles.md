# Fish vLLM / Oncompute Runner Profiles

## Recommendation

For the first public Fish Runner that should feel good, rent a VM with:

```text
GPU: 1x NVIDIA L40S 48GB, A40 48GB, A6000 48GB, or A100 40GB+
CPU: 8-16 vCPU
RAM: 64 GB
Disk: 250 GB NVMe minimum, 500 GB preferred
OS: Ubuntu 22.04 or 24.04
Network: private path from Fish web/API to the runner
```

This lets Fish start with `Qwen/Qwen3-14B` at a modest context length and avoid the most common pilot failure mode: a model that technically starts but becomes slow, memory-constrained, or unstable under light concurrent use.

For a cheaper beta, use:

```text
GPU: 1x NVIDIA L4 24GB, RTX 4090 24GB, RTX 3090 24GB, or better
CPU: 8 vCPU
RAM: 32-64 GB
Disk: 200-300 GB NVMe
Model: Qwen/Qwen3-8B
```

For a tiny experimental host:

```text
GPU: 16 GB card, such as RTX 4080 / 4080 SUPER
CPU: 8 vCPU
RAM: 32 GB
Disk: 200 GB NVMe
Model: Qwen/Qwen3-8B-FP8
```

Do not use 8 GB GPUs for the public Fish Runner. They can be useful for smoke tests, but the UX will be fragile.

## Starting Docker Image

Use the official OpenAI-compatible vLLM image:

```text
vllm/vllm-openai:latest
```

The compose file keeps the image configurable:

```text
FISH_VLLM_IMAGE=vllm/vllm-openai:latest
```

For production, pin this to a tested tag or digest after the first successful GPU smoke. Keep `latest` only while we are still moving fast and testing.

## Starting Model Set

Use one model first. Multi-model routing is useful later, but it complicates capacity and proof before the first launch.

Recommended first model:

```text
Qwen/Qwen3-8B
```

Why:

- small enough for 24 GB GPUs;
- strong enough for chat, summaries, and simple coding help;
- fast enough for a first Fish public pilot;
- no gated model approval required in the usual Hugging Face flow.

Recommended quality model:

```text
Qwen/Qwen3-14B
```

Why:

- better answers than 8B;
- still practical on one 40-48 GB GPU;
- good fit for the first version that should feel polished.

Low-VRAM fallback:

```text
Qwen/Qwen3-8B-FP8
```

Use this only when the available VM is 16 GB VRAM. Keep `FISH_RUNNER_MAX_QUEUE=1` until latency and memory are proven.

## Prepared Profiles

The repo includes:

```text
deploy/warm-inference/env.qwen3-8b.example
deploy/warm-inference/env.qwen3-14b-l40s.example
deploy/warm-inference/env.qwen3-8b-fp8-16gb.example
```

On the GPU host:

```bash
cp deploy/warm-inference/env.qwen3-14b-l40s.example /opt/fish-warm-inference/.env
```

Then replace secrets:

```text
FISH_VLLM_API_KEY
FISH_RUNNER_API_KEY
FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM
```

Generate signing keys:

```bash
node scripts/generate-fish-runner-key.mjs runner-ocean-navy-qwen3-14b-ed25519
```

Put the private values on the GPU runner host and the public values on the Fish web/API host.

## Oncompute Fit

The current Oncompute environment feed should be checked before renting or selecting capacity:

```bash
node scripts/discover-oncompute-envs.mjs --chain 8453 --limit 20
```

As of the latest local check, visible examples included:

```text
NVIDIA L40S, about 46 GB VRAM
NVIDIA RTX 4080 SUPER, about 16 GB VRAM
NVIDIA RTX 3060, about 12 GB VRAM
Quadro P4000, about 8 GB VRAM
```

For Fish Runner, prefer L40S-class capacity. The smaller cards are acceptable for Ocean batch proofs or low-VRAM smoke, but not ideal for a public warm chat/API product.

## Launch Path

1. Rent or select a GPU host.
2. Install NVIDIA driver, NVIDIA Container Toolkit, Docker, and Compose.
3. Copy `deploy/warm-inference/docker-compose.vllm.example.yml` to `/opt/fish-warm-inference/docker-compose.yml`.
4. Copy the Fish Runner and smoke scripts to the same directory.
5. Copy one env profile to `/opt/fish-warm-inference/.env`.
6. Generate runner signing keys.
7. Start:

```bash
docker compose --env-file .env up -d
```

8. Smoke vLLM and Fish Runner.
9. Point Fish web/API to the runner:

```text
FISH_CHAT_ROUTE=ocean-first
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<private-runner-host>:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<runner api key>
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat
FISH_OCEAN_DEMO_PROVIDER_ID=<provider id>
FISH_RUNNER_PUBLIC_KEY_ID=<runner key id>
FISH_RUNNER_PUBLIC_KEY_PEM=<runner public key>
```

10. Run `/api/warm/status` for the public snapshot, `/api/warm/status?probe=live` with `x-fish-admin-token` for the operator live probe, and `/api/ocean/provider-readiness` before exposing public traffic.
