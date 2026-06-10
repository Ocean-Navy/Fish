# Phase 1 — GPU/AI Backend Prep (WP8)

This is the Phase-1 checklist for taking "use AI" from mock to a real warm inference backend. It is the condensed, demo-focused companion to `docs/warm-inference-runbook.md` (which stays the deep reference for monitoring, rollback, and incident handling). Everything here is config and verification; the only thing left for the operator is renting the VM and running the commands.

Target shape:

```
Tester browser ──> Fish web app (web VM / host)
                     │  FISH_CHAT_ROUTE=ocean-demo-vllm
                     ▼
              fish-runner :8088  (signs usage receipts, the ONLY exposed port)
                     │  internal docker network
                     ▼
                 vLLM :8001     (raw OpenAI-compatible engine, NEVER public)
```

The web app must point at the **runner** (`:8088/v1`), not raw vLLM. The runner enforces queue limits, prices the call, and signs the usage receipt that the web app verifies (`fish.runnerSignatureState: "verified"`).

## 1. Rent the VM

| Profile (env example in `deploy/warm-inference/`) | Model | VRAM needed | Typical cards |
|---|---|---|---|
| `env.qwen3-8b.example` (default) | `Qwen/Qwen3-8B` | 24 GB recommended | L4, RTX 4090, RTX 3090 |
| `env.qwen3-8b-fp8-16gb.example` (low VRAM) | `Qwen/Qwen3-8B-FP8` | 16 GB | RTX 4080 / 4080 SUPER |
| `env.qwen3-14b-l40s.example` (quality) | `Qwen/Qwen3-14B` | 48 GB | L40S, A40, A6000, A100 40GB+ |

Checklist:

- [ ] Ubuntu 22.04 (or similar) VM with one of the GPUs above, 100 GB+ disk (model weights + HF cache + docker images).
- [ ] NVIDIA driver installed: `nvidia-smi` shows the card.
- [ ] Docker + **NVIDIA Container Toolkit** installed; verify GPU passthrough:
  ```bash
  docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
  ```
- [ ] A private network path between the web host and this VM (cloud security group / VPC, or WireGuard/Tailscale). The runner port (8088) must be reachable from the web host only — not the public internet.
- [ ] Optional: `HUGGING_FACE_HUB_TOKEN` ready if the model needs gated downloads.

(Full host setup commands: `docs/warm-inference-runbook.md` → "GPU Host Setup".)

## 2. Bring up the warm stack

On the GPU VM, from the repo checkout:

```bash
cp deploy/ocean-demo-stack/env.example .env.ocean-demo-stack
```

Edit `.env.ocean-demo-stack` — the warm-profile keys to set (copy model values from your chosen `deploy/warm-inference/env.*.example` profile):

```bash
# vLLM engine (stays internal; runner reaches it via the docker network)
FISH_VLLM_BIND=127.0.0.1            # never 0.0.0.0
FISH_VLLM_PORT=8001
FISH_VLLM_API_KEY=<long random secret #1>
FISH_VLLM_MODEL=Qwen/Qwen3-8B       # or the FP8 / 14B profile value
FISH_VLLM_SERVED_MODEL_NAME=fish-warm-chat
FISH_VLLM_MAX_MODEL_LEN=8192        # 4096 on the 16 GB profile
FISH_VLLM_GPU_MEMORY_UTILIZATION=0.88
HUGGING_FACE_HUB_TOKEN=             # if needed

# Fish runner sidecar (the endpoint the web app calls)
FISH_RUNNER_BIND=<GPU VM private IP>   # 127.0.0.1 if web app runs on the same host
FISH_RUNNER_PORT=8088
FISH_RUNNER_ID=runner_ocean_navy_qwen3_8b
FISH_RUNNER_PROVIDER_ID=ocean-navy-demo-node
FISH_RUNNER_API_KEY=<long random secret #2, different from the vLLM key>
FISH_RUNNER_PRICE_USD_PER_1K_TOKENS=0
FISH_RUNNER_MAX_QUEUE=3
FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM=<from generate-fish-runner-key, below>
FISH_RUNNER_SIGNING_KEY_ID=runner-ocean-navy-qwen3-8b-ed25519
```

Generate the runner's Ed25519 receipt-signing key first:

```bash
node scripts/generate-fish-runner-key.mjs
# paste the printed private key PEM into FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM
# keep the printed PUBLIC key for the web overlay below
```

Start and smoke the stack:

```bash
make ocean-demo-up-warm          # compose --profile warm: vllm + fish-runner (+ ocean node services)
make ocean-demo-smoke            # scripts/smoke-ocean-demo-stack.sh
scripts/smoke-fish-runner.sh     # direct runner round-trip
```

First start downloads model weights — expect several minutes before vLLM answers `/models`.

## 3. Wire the web app (env overlay)

Generate the overlay from the same `.env.ocean-demo-stack` so keys can't drift:

```bash
npm run ocean-demo:web-env -- --host <GPU VM private IP or DNS>
```

That prints the block to paste into the **web host's private env** (never commit it). Filled template, with where each value comes from:

```bash
# Route selection — the gateway serves chat from the warm vLLM route
FISH_CHAT_ROUTE=ocean-demo-vllm

# Warm route endpoint = the SIGNING RUNNER (:8088), not raw vLLM (:8001)
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://<GPU VM private IP>:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<FISH_RUNNER_API_KEY from the stack env>
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat        # = FISH_VLLM_SERVED_MODEL_NAME
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node # = FISH_RUNNER_PROVIDER_ID
FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS=0         # = FISH_RUNNER_PRICE_USD_PER_1K_TOKENS
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=10              # warm route daily spend cap

# Runner receipt verification (public key printed by generate-fish-runner-key)
FISH_RUNNER_PUBLIC_KEY_ID=runner-ocean-navy-qwen3-8b-ed25519
FISH_RUNNER_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Outbound call ceiling (WP2): default 60000 if unset — keep it set explicitly for the demo
FISH_CHAT_TIMEOUT_MS=60000
```

Restart the web app after applying the overlay.

## 4. Verify end to end

- [ ] `GET /api/warm/status` → warm route `configured: true`, status `ready`/`active`.
- [ ] Operator live probe (requires admin token outside dev): `GET /api/warm/status?probe=live` with `x-fish-admin-token` → probe reports the runner answered `/models`.
- [ ] Ask flow: `POST /api/meal/order` (guest) or `POST /v1/chat/completions` (API key) → response `fish.route: "ocean-demo-vllm"`, **`fish.costState: "provider_verified"`**, `fish.runnerSignatureState: "verified"`.
- [ ] A usage receipt lands in `/v1/usage` / the dashboard with non-mock route.
- [ ] Pull the GPU VM's network plug (or stop the runner) mid-demo once: the request fails within `FISH_CHAT_TIMEOUT_MS`, the credit reservation is released, and the route falls back per plan policy — no stuck requests.

## 5. Security reminders

- Expose **only** the runner (8088) to the web host's private network. Raw vLLM (8001) and Typesense/Ocean node ports stay loopback (`*_BIND=127.0.0.1`).
- `FISH_RUNNER_API_KEY` ≠ `FISH_VLLM_API_KEY`; both long and random; the web app only ever sees the runner key.
- The runner signing **private** key lives only on the GPU VM; the web app gets only the **public** key.
- The generated overlay contains secrets — store it in the web host env, never in the repo.
- Outbound timeout (WP2, `FISH_CHAT_TIMEOUT_MS`) is the guard that a hung GPU can't strand requests holding credits/concurrency slots — leave it on.

## Appendix — wiring verification (read-only, no app code changed)

Verified that the overlay vars are exactly what the code reads:

| Env var | Consumed at |
|---|---|
| `FISH_CHAT_ROUTE` | `src/lib/fishRouter.ts` `getFishRouterConfig()` → `normalizeRouteId()` (accepts `ocean-demo-vllm`, `ocean-first`, `vllm`, ...) |
| `FISH_OCEAN_DEMO_VLLM_BASE_URL` / `_API_KEY` / `_MODEL` | `src/lib/fishRouter.ts` `getWarmInferenceConfig()`; route counts as configured when base URL + model are set (`openAiCompatibleChat.ts` `isOpenAiCompatibleRouteConfigured`) |
| `FISH_OCEAN_DEMO_PROVIDER_ID` / `_COST_USD_PER_1K_TOKENS` | `getWarmInferenceConfig()` → provider id + cost on every receipt |
| `FISH_OCEAN_DEMO_DAILY_BUDGET_USD` | `fishRouter.ts` route budgets → enforced by `fishBudget.ts` reservations |
| `FISH_RUNNER_PUBLIC_KEY_ID` / `_PEM` (or `FISH_RUNNER_PUBLIC_KEYS_JSON` / `_PATH`) | `src/lib/runnerReceipts.ts` trusted-key set → `runnerSignatureState: "verified"` |
| `FISH_CHAT_TIMEOUT_MS` | `src/lib/fishChatTimeout.ts` → armed on every warm/provider/external call (`openAiCompatibleChat.ts`, `externalChat.ts`) |

Call path: gateway (`fishChatGateway.ts`) → `runVllmChat` (`vllmChat.ts`) → `runOpenAiCompatibleChat` against `FISH_OCEAN_DEMO_VLLM_BASE_URL/chat/completions`; the `ocean-demo-vllm` route carries `costState: "provider_verified"` (`fishRouter.ts`), which is what the demo must show. `GET /api/warm/status` (`warmInferenceStatus.ts`) probes `<baseUrl>/models` for the readiness check.
