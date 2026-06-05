# Fish Warm Inference Runbook

This runbook covers the first practical warm inference MVP for Fish: a GPU host runs vLLM and, when available, a Fish Runner sidecar next to an optional Ocean Node. The model stays loaded in memory, and Fish Gateway reaches the OpenAI-compatible endpoint over a private path.

This is an operator document. It does not change the current gateway route implementation and should not be read as a claim that public Fish chat is already Ocean-native.

## Target Shape

```text
Fish website / API
  -> Fish Gateway
  -> private network or tunnel
  -> Fish Runner sidecar
  -> local vLLM OpenAI-compatible endpoint
  -> warm open-source model

Same GPU host, optional:
  -> Ocean Node for provider identity and Ocean / Oncompute anchoring
```

For the MVP, prefer one reliable model on one GPU host. Do not launch a new Ocean compute job per chat message. That pattern is likely too slow for interactive chat unless Ocean / Oncompute offers a proven long-running warm endpoint with stable networking, streaming, auth, and uptime.

## Operator Assumptions

- Ubuntu 22.04/24.04 or another NVIDIA-supported Linux server.
- NVIDIA driver and container toolkit are installed.
- Docker Engine and the Docker Compose plugin are installed.
- The GPU has enough VRAM for the selected model and context length.
- Fish Gateway and the GPU host communicate over a private network, VPN, WireGuard tunnel, private cloud network, or an allowlisted reverse proxy.
- Public inbound access to vLLM is blocked.
- The first production-like route is capped, monitored, and has a kill switch.

## Model Selection

Choose the smallest model that is useful, stable, and fast on the available GPU. Good first classes to test are Qwen 14B/32B, Llama 8B class, Mistral-style models, Qwen Coder variants, or distill-style models that fit the host comfortably.

Reliability beats headline model size. A model that consistently returns first tokens quickly is better for the public MVP than a larger model that frequently exhausts memory or stalls.

For concrete VM and model profiles, see `docs/vllm-oncompute-runner-profiles.md`.

Short version:

```text
Recommended first public runner: 1x L40S 48GB or A100 40GB+, Qwen/Qwen3-14B.
Cheaper beta runner: 1x L4/RTX 4090/RTX 3090 24GB, Qwen/Qwen3-8B.
Small smoke runner only: 16GB card, Qwen/Qwen3-8B-FP8, queue=1.
```

## GPU Host Setup

Install base packages:

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates jq htop nvtop
```

Verify the GPU:

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

Create a runtime directory:

```bash
sudo mkdir -p /opt/fish-warm-inference
sudo chown "$USER":"$USER" /opt/fish-warm-inference
```

Copy the example compose file, runner sidecar, and smoke helpers:

```bash
cp deploy/warm-inference/docker-compose.vllm.example.yml /opt/fish-warm-inference/docker-compose.yml
cp deploy/warm-inference/fish-runner.mjs /opt/fish-warm-inference/fish-runner.mjs
cp scripts/smoke-vllm-openai-compatible.sh /opt/fish-warm-inference/smoke-vllm-openai-compatible.sh
cp scripts/smoke-fish-runner.sh /opt/fish-warm-inference/smoke-fish-runner.sh
cd /opt/fish-warm-inference
```

Create `/opt/fish-warm-inference/.env` with real values:

```text
FISH_VLLM_IMAGE=vllm/vllm-openai:latest
FISH_VLLM_API_KEY=<long random secret>
FISH_VLLM_MODEL=Qwen/Qwen3-14B
FISH_VLLM_SERVED_MODEL_NAME=fish-warm-chat
FISH_VLLM_MAX_MODEL_LEN=8192
FISH_VLLM_GPU_MEMORY_UTILIZATION=0.88
FISH_RUNNER_ID=runner_ocean_navy_demo
FISH_RUNNER_PROVIDER_ID=ocean-navy-demo-node
FISH_RUNNER_API_KEY=<different long random secret>
FISH_RUNNER_PRICE_USD_PER_1K_TOKENS=0
FISH_RUNNER_MAX_QUEUE=2
FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM=
FISH_RUNNER_SIGNING_KEY_ID=runner-ocean-navy-demo-ed25519
HUGGING_FACE_HUB_TOKEN=
```

Prepared starter env files:

```text
deploy/warm-inference/env.qwen3-8b.example
deploy/warm-inference/env.qwen3-14b-l40s.example
deploy/warm-inference/env.qwen3-8b-fp8-16gb.example
```

For the combined Ocean Node + workload adapter + warm runner stack, prefer:

```text
deploy/ocean-demo-stack/docker-compose.yml
deploy/ocean-demo-stack/env.example
```

That stack is the current public-testnet target because it runs the Ocean Node and Fish workload adapter beside vLLM on the same GPU VM.

On Apple Silicon, use the same stack with the `mlx` profile: run `mlx_lm.server` on the macOS host and run Fish Runner in Docker against `host.docker.internal:8080`. This is good for local website + runner + inference testing, but it is not the same as NVIDIA vLLM or GPU access inside Ocean compute containers.

Do not commit this file.

To create an Ed25519 runner signing key for the env file, generate it on the operator machine and store the escaped private key as `FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM`:

```bash
node scripts/generate-fish-runner-key.mjs runner-ocean-navy-demo-ed25519
```

Copy the public key into Fish Gateway as a trusted runner key:

```text
FISH_RUNNER_PUBLIC_KEY_ID=runner-ocean-navy-demo-ed25519
FISH_RUNNER_PUBLIC_KEY_PEM=<public key with newlines escaped as \n>
```

For more than one selected runner, use either `FISH_RUNNER_PUBLIC_KEYS_JSON`:

```json
[
  {
    "keyId": "runner-ocean-navy-demo-ed25519",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----\\n"
  }
]
```

or point `FISH_RUNNER_PUBLIC_KEYS_PATH` at a JSON file with that shape. Keep the private key out of git. Without a trusted public key, Fish records the receipt with `signatureState: "invalid"` and `signatureError: "trusted_runner_public_key_not_configured"`; public proof counters only include receipts that verify against a configured trusted Ed25519 public key.

## vLLM Launch

Start the engine:

```bash
docker compose --env-file .env up -d
docker compose logs -f vllm
```

The example binds vLLM to `127.0.0.1:8000` and Fish Runner to `127.0.0.1:8088` on the GPU host. That is intentional. Expose the runner only to Fish Gateway through private networking. Do not expose vLLM publicly.

Check local health from the GPU host:

```bash
curl -fsS \
  -H "authorization: Bearer $FISH_VLLM_API_KEY" \
  http://127.0.0.1:8000/v1/models
```

Run a small completion smoke:

```bash
FISH_VLLM_BASE_URL=http://127.0.0.1:8000/v1 \
FISH_VLLM_API_KEY="$FISH_VLLM_API_KEY" \
FISH_VLLM_MODEL="$FISH_VLLM_SERVED_MODEL_NAME" \
./smoke-vllm-openai-compatible.sh
```

Expected result: the script verifies `/models`, posts a short `/chat/completions` request, and exits nonzero if either call fails.

## Fish Runner Sidecar

The runner is the intended provider-side policy and proof layer between Fish Gateway and vLLM. The repo includes a minimal no-dependency runner at `deploy/warm-inference/fish-runner.mjs`. It is still an MVP sidecar, not the final selected-provider network.

Runner responsibilities:

- accept traffic from Fish Gateway only;
- enforce per-request token caps and concurrent request limits;
- rely on Fish Gateway for plan-based per-minute request limits;
- call vLLM over loopback or a private Docker network;
- expose `/healthz`, `/models`, `/v1/chat/completions`, and a constrained `/receipts/sign` lookup for receipts already issued by this runner;
- record first-token latency, duration, token usage, status, and route id;
- sign public-safe receipts without storing raw prompt or output text in public proof;
- reject unauthenticated chat and receipt-signing traffic when `FISH_RUNNER_API_KEY` is not configured, or when the model is cold, degraded, over budget, or queue depth is too high.

Check runner health:

```bash
curl -fsS http://127.0.0.1:8088/healthz
curl -fsS http://127.0.0.1:8088/models
FISH_RUNNER_BASE_URL=http://127.0.0.1:8088 \
FISH_RUNNER_API_KEY="$FISH_RUNNER_API_KEY" \
./smoke-fish-runner.sh
```

Set `FISH_RUNNER_SMOKE_CHAT=1` on the smoke command only after vLLM is warm. Without that flag, the runner smoke checks health and model inventory only. With chat enabled, it also asks `/receipts/sign` to re-sign the receipt identified by the job id that `/v1/chat/completions` just produced; the runner does not sign caller-supplied receipt bodies.

When Runner is not deployed, treat a direct Gateway-to-vLLM route as a controlled demo backend, not the final provider contract.

## Ocean Node Demo Stack

For the public testnet path, run Ocean Node on the same GPU VM as Fish Runner and the workload adapter:

```bash
cp deploy/ocean-demo-stack/env.example .env.ocean-demo-stack
node scripts/generate-ocean-node-compute-env.mjs --env
make ocean-demo-up-warm FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
scripts/smoke-ocean-demo-stack.sh .env.ocean-demo-stack
```

For local Apple Silicon testing:

```bash
python3 -m venv .venv-mlx
source .venv-mlx/bin/activate
pip install -U mlx-lm
mlx_lm.server --model mlx-community/Llama-3.2-3B-Instruct-4bit --host 127.0.0.1 --port 8080
scripts/smoke-mlx-openai-compatible.sh
make ocean-demo-up-mlx FISH_OCEAN_DEMO_ENV=.env.ocean-demo-stack
```

For this MVP:

- Ocean Node handles free test compute dishes through the private workload adapter.
- vLLM remains the low-latency warm chat server.
- Fish Runner is the only OpenAI-compatible surface the public web VM should call.
- The workload adapter is the only Fish service that should call Ocean CLI / Ocean Node for dishes.
- Do not route every interactive chat message through a fresh compute-to-data job.
- Do not advertise paid third-party Oncompute demand until selected external providers actually serve traffic.

Keep Ocean Node HTTP, adapter, vLLM, and Fish Runner bound to localhost or a private interface unless an operator intentionally opens them through a private network, WireGuard, SSH tunnel, or nginx allowlist. Ocean Node mounts the Docker socket for compute execution, so use a dedicated host with conservative free-job caps.

## Fish Gateway Configuration

Current Fish V0 supports a mock route, an Ocean Navy demo vLLM route, a selected Ocean provider route, and an external OpenAI-compatible fallback. When Fish Runner is deployed, point Fish Gateway at the runner's OpenAI-compatible `/v1` surface, not raw vLLM:

```text
FISH_CHAT_ROUTE=ocean-first
FISH_CHAT_PAUSED=false
FISH_ROUTER_KILL_SWITCH=false
FISH_MAX_INPUT_TOKENS=1000
FISH_MAX_OUTPUT_TOKENS=512
FISH_DAILY_KEYED_QUOTA=20
# Shared across unauthenticated meal-counter guests; API-key users get keyed quota above.
FISH_DAILY_ANONYMOUS_QUOTA=5
FISH_RATE_LIMIT_MAX_BUCKETS=10000
# Granted once to the shared unauthenticated guest account, not once per browser.
FISH_GUEST_CREDIT_GRANT=25
FISH_MAX_CONCURRENT_REQUESTS=8
FISH_MOCK_DAILY_BUDGET_USD=0
FISH_OCEAN_DEMO_VLLM_BASE_URL=http://127.0.0.1:8088/v1
FISH_OCEAN_DEMO_VLLM_API_KEY=<same value as FISH_RUNNER_API_KEY>
FISH_OCEAN_DEMO_VLLM_MODEL=fish-warm-chat
FISH_OCEAN_DEMO_PROVIDER_ID=ocean-navy-demo-node
FISH_OCEAN_DEMO_COST_USD_PER_1K_TOKENS=<operator estimate>
FISH_OCEAN_DEMO_DAILY_BUDGET_USD=<daily demo budget>
FISH_RUNNER_PUBLIC_KEY_ID=runner-ocean-navy-demo-ed25519
FISH_RUNNER_PUBLIC_KEY_PEM=<runner public key with newlines escaped as \n>
```

`FISH_CHAT_ROUTE=ocean-first`, `hybrid`, and `ocean-demo-vllm` all choose the same warm demo lane. Use `ocean-first` in deployment files because it matches the product story; Fish still records the exact route that served each request. Fish reserves estimated provider spend against the route daily budget before each backend call and counts those in-flight reservations with completed receipts, so concurrent requests are rejected once the configured daily budget is fully reserved.

Selected Ocean providers use their own route id, provider id, daily budget, and model entry:

```text
FISH_CHAT_ROUTE=ocean-provider
FISH_OCEAN_PROVIDER_BASE_URL=<selected provider or Fish Runner /v1 base URL>
FISH_OCEAN_PROVIDER_API_KEY=<selected provider or runner API key>
FISH_OCEAN_PROVIDER_MODEL=<selected provider model>
FISH_OCEAN_PROVIDER_ID=<provider id shown in receipts>
FISH_OCEAN_PROVIDER_COST_USD_PER_1K_TOKENS=<operator estimate>
FISH_OCEAN_PROVIDER_DAILY_BUDGET_USD=<daily selected-provider budget>
FISH_RUNNER_PUBLIC_KEY_ID=<provider runner key id>
FISH_RUNNER_PUBLIC_KEY_PEM=<provider runner public key with newlines escaped as \n>
```

Only `team-api` and `provider-test` plans may use the selected-provider route in the V0 gateway. This keeps public demo traffic from accidentally depending on one private provider while selected-provider proof is still being validated.

### Selected provider reality check

Use the admin-only readiness endpoint before claiming selected Ocean provider traffic is live:

```bash
curl -fsS \
  -H "content-type: application/json" \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -X POST "$FISH_APP_URL/api/ocean/provider-readiness" \
  --data '{"probeModels":true,"probeChat":true,"timeoutMs":5000}'
```

The response separates three different facts:

- `route.configured`: Fish has `FISH_OCEAN_PROVIDER_BASE_URL` and `FISH_OCEAN_PROVIDER_MODEL`.
- `probes.models.state=ok`: the selected provider answered `/models`.
- `probes.chat.state=ok`: the selected provider answered one tiny chat through the same OpenAI-compatible adapter used by `/v1/chat/completions`.

`trafficReady=true` requires the selected-provider route to be active, unpaused, visible through `/models`, and proven by a chat probe. A model-list probe alone is not enough.

`proofJobReady=true` is separate. It requires the provider allowlist and private provider job endpoint used by `/api/providers/jobs` and `/api/providers/smoke`. This proves hash-only provider proof jobs can run; it does not by itself prove low-latency chat.

The readiness response never returns raw provider URLs, API keys, prompt text, or output text. If the chat probe succeeds it returns only timing, token counts, a response hash, cost estimate, and Fish Runner receipt metadata when the runner provides it.

External fallback is intentionally separate:

```text
FISH_CHAT_ROUTE=external-fallback
FISH_EXTERNAL_CHAT_BASE_URL=<external OpenAI-compatible /v1 base URL>
FISH_EXTERNAL_CHAT_API_KEY=<runner or vLLM API key>
FISH_EXTERNAL_CHAT_MODEL=<fallback model>
FISH_EXTERNAL_PROVIDER_ID=external-compatible
FISH_EXTERNAL_COST_USD_PER_1K_TOKENS=<operator estimate>
FISH_EXTERNAL_FALLBACK_DAILY_BUDGET_USD=<daily fallback budget>
FISH_EXTERNAL_FALLBACK_FREE_ALLOWED=false
```

Use this only in private preview or controlled beta. External credentials alone do not enable fallback from an Ocean route; set `FISH_CHAT_BACKEND=external` as an explicit operator opt-in if an Ocean route may retry against this outside backend. Keep public route labels clear: demo vLLM, selected Ocean provider, and outside fallback are different routes with different evidence.

## Network And Security

Required controls:

- vLLM binds to `127.0.0.1` or a private interface, never public `0.0.0.0` without a firewall and gateway auth.
- Fish Gateway or Fish Runner authenticates with a long random API key or stronger service identity; Runner rejects protected endpoints when `FISH_RUNNER_API_KEY` is unset.
- Public users never receive the vLLM base URL or API key.
- Admin endpoints require `FISH_ADMIN_TOKEN`.
- SSH is key-only and restricted to operators.
- Firewall allows only SSH, public web ingress for Fish, and private gateway-to-runner traffic.
- Logs avoid raw prompt and output text where possible.
- Secrets live in `.env`, a system secret manager, or deployment secret store, not git.

Example host firewall posture:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow from <fish-gateway-private-ip> to any port 8000 proto tcp
sudo ufw enable
```

If the endpoint is reached through nginx, Caddy, or a tunnel, require TLS and a service token at that layer and keep the upstream bound privately.

## Health Checks

Minimum checks before sending user traffic:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/warm/status
# Operator-only live probe; requires FISH_ADMIN_TOKEN outside local development.
curl -fsS -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" "http://127.0.0.1:3000/api/warm/status?probe=live"
curl -fsS -H "authorization: Bearer $FISH_VLLM_API_KEY" http://127.0.0.1:8000/v1/models
curl -fsS http://127.0.0.1:8088/healthz
FISH_VLLM_BASE_URL=http://127.0.0.1:8000/v1 \
FISH_VLLM_API_KEY="$FISH_VLLM_API_KEY" \
FISH_VLLM_MODEL="$FISH_VLLM_SERVED_MODEL_NAME" \
./smoke-vllm-openai-compatible.sh
FISH_RUNNER_BASE_URL=http://127.0.0.1:8088 \
FISH_RUNNER_API_KEY="$FISH_RUNNER_API_KEY" \
./smoke-fish-runner.sh
```

Operator readiness checks:

- first-token latency is acceptable for the selected model;
- `nvidia-smi` shows stable VRAM use after warmup;
- repeated smoke prompts do not grow memory without bound;
- queue depth and concurrency limits are enforced by Runner or gateway policy;
- route labels distinguish mock, warm demo, selected Ocean provider, and external fallback;
- Fish Gateway trusts the runner public key and marks the runner receipt `verified` after a successful signature check;
- feature caps distinguish Ask, Code, Docs, Ocean help, API, and disabled Images behind one endpoint;
- Fish Gateway reserves credits before backend calls and releases that reserve if the warm backend fails before usage is recorded;
- `/v1/chat/completions` supports SSE compatibility when clients send `stream: true`; first-token streaming from Runner is still a later hardening step;
- `/dashboard` shows a public warm demo snapshot without endpoint URLs, API keys, prompts, outputs, or live backend probes;
- public proof does not expose prompt or output text.

## Monitoring

Track at least:

- vLLM process uptime and restart count;
- GPU utilization, VRAM use, power, and temperature;
- request rate, error rate, timeout rate, and cancellation rate;
- first-token latency p50/p95 and total latency p50/p95;
- input tokens, output tokens, and estimated cost;
- daily request and cost counters;
- kill switch state;
- last smoke result and model warm state.

Useful local commands:

```bash
docker compose ps
docker compose logs --tail=200 vllm
nvidia-smi
watch -n 2 nvidia-smi
```

`/api/warm/status` reports the active warm lane from Fish configuration without live backend probing by default. With `FISH_CHAT_ROUTE=ocean-demo-vllm` it summarizes the demo vLLM config; with `FISH_CHAT_ROUTE=ocean-provider` it summarizes the selected-provider config. Add `?probe=live` with the admin token for an operator-only `/models` probe. Public dashboard and summary rendering must use the default snapshot path so unauthenticated visitors cannot trigger authenticated runner requests.

Do not publish operator-only endpoint URLs, API keys, raw prompts, raw outputs, exact private IPs, or unreviewed provider contact details.

## Cost Controls

No public warm route should run without:

- max input tokens;
- max output tokens;
- plan-based per-minute request limit;
- plan-based monthly request limit;
- max requests per deployment-scoped anonymous guest bucket per day;
- max concurrent requests;
- model-level daily request limit;
- model-level daily cost limit;
- backend kill switch;
- timeout and cancellation handling;
- fallback disabled by default for anonymous users.

For first public testing, keep the deployment-scoped anonymous guest bucket to a very small allowance such as 3 to 5 short messages per day and 512 output tokens per response. API-key users should use keyed quota instead of the guest bucket. Do not trust client-supplied proxy headers for guest identity; set `FISH_GUEST_ID_SALT` only to separate one deployment bucket from another. The guest bucket is internal-only and must not be usable as a `/v1` bearer API key.

## Smoke Test From Fish Gateway

If Fish Gateway is configured to use the warm endpoint through the current external-compatible path:

```bash
curl -sS http://127.0.0.1:3000/v1/api_keys \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d '{"label":"Warm route smoke","creditGrant":100,"planId":"free"}'
```

Key management stays prototype-simple: `GET /v1/api_keys` with a Fish bearer key shows the current key metadata, and `DELETE /v1/api_keys/current` revokes that bearer key without deleting historical receipts.

Operators can add pilot credits without public checkout:

```bash
curl -sS http://127.0.0.1:3000/api/billing/topups \
  -H 'content-type: application/json' \
  -H "x-fish-admin-token: $FISH_ADMIN_TOKEN" \
  -d "{\"accountId\":\"$FISH_ACCOUNT_ID\",\"amount\":500,\"lane\":\"prepaid\",\"idempotencyKey\":\"warm-smoke-001\"}"
```

This route records an immutable credit entry and uses the idempotency key or payment provider event id to avoid double-crediting the same account.

Then use the returned API key:

```bash
curl -fsS http://127.0.0.1:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $FISH_API_KEY" \
  -d '{
    "model":"fish-demo-chat",
    "messages":[{"role":"user","content":"Reply with one short sentence about Fish."}],
    "max_tokens":64
  }'
```

Check that the receipt stores usage and hashes only:

```bash
curl -fsS http://127.0.0.1:3000/v1/usage \
  -H "authorization: Bearer $FISH_API_KEY"
```

## Rollback

Immediate kill switch:

```bash
export FISH_ROUTER_KILL_SWITCH=true
```

For the current prototype route, switch back to mock:

```text
FISH_CHAT_ROUTE=mock
FISH_CHAT_BACKEND=mock
FISH_EXTERNAL_CHAT_BASE_URL=
FISH_EXTERNAL_CHAT_API_KEY=
FISH_EXTERNAL_CHAT_MODEL=
FISH_OCEAN_DEMO_VLLM_BASE_URL=
FISH_OCEAN_DEMO_VLLM_API_KEY=
```

Restart Fish Gateway after config changes:

```bash
docker compose restart fish-web
```

Stop vLLM on the GPU host:

```bash
cd /opt/fish-warm-inference
docker compose down
```

Keep proof and usage files for incident review unless there is a clear legal or security requirement to remove local runtime data.

## Incident Checklist

Pause traffic when any of these happen:

- error or timeout rate spikes;
- first-token latency is consistently unacceptable;
- GPU memory pressure causes restarts or degraded generations;
- daily budget is close to exhausted or in-flight reservations are causing legitimate traffic to receive `daily_route_budget_exceeded`;
- endpoint auth is suspected to be exposed;
- route labels would misrepresent the backend;
- receipts or usage accounting look inconsistent.

During an incident:

1. Enable the kill switch or set `FISH_CHAT_BACKEND=mock`.
2. Preserve logs and receipt files.
3. Record start time, impact, route id, provider id, model, and config version.
4. Check whether any prompt or output text leaked into public proof, exports, logs, or dashboards.
5. Resume only after smoke tests, budget counters, and route labels are verified.

## Definition Of Done For First Warm MVP

- vLLM serves a chosen model from a private endpoint.
- Fish Gateway or Runner can reach the endpoint without exposing it publicly.
- A smoke script can call `/models` and `/chat/completions`.
- Operators have a documented rollback to mock mode.
- Monitoring covers health, latency, tokens, GPU pressure, and budget.
- Public copy and proof labels do not overstate Ocean-native status.
- Ocean Node, if present, is described as identity/anchoring until a proven warm endpoint path exists.
