#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-.env.ocean-demo-stack}"
compose_file="${FISH_OCEAN_DEMO_COMPOSE_FILE:-deploy/ocean-demo-stack/docker-compose.yml}"

if [[ ! -f "${env_file}" ]]; then
  echo "Missing env file: ${env_file}" >&2
  echo "Copy deploy/ocean-demo-stack/env.example to .env.ocean-demo-stack first." >&2
  exit 1
fi

read_env() {
  local key="$1"
  local fallback="$2"
  local value
  value="$(grep -E "^${key}=" "${env_file}" | tail -n 1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  if [[ -n "${value}" ]]; then
    printf "%s" "${value}"
  else
    printf "%s" "${fallback}"
  fi
}

ocean_port="$(read_env OCEAN_NODE_HTTP_PORT 8000)"
adapter_port="$(read_env OCEAN_WORKLOAD_ADAPTER_PORT 8787)"
runner_port="$(read_env FISH_RUNNER_PORT 8088)"
adapter_key="$(read_env OCEAN_WORKLOAD_ADAPTER_API_KEY "")"

echo "Validating Compose config"
docker compose -f "${compose_file}" --env-file "${env_file}" config >/dev/null

echo "Checking Ocean Node compute environments"
curl -fsS "http://127.0.0.1:${ocean_port}/api/services/computeEnvironments" >/tmp/fish-ocean-compute-envs.json
node -e 'const fs=require("fs"); const rows=JSON.parse(fs.readFileSync("/tmp/fish-ocean-compute-envs.json","utf8")); if(!Array.isArray(rows)) process.exit(1); console.log(`compute environments: ${rows.length}`);'

echo "Checking Ocean workload adapter"
curl -fsS "http://127.0.0.1:${adapter_port}/healthz" >/tmp/fish-ocean-adapter-health.json
adapter_mode="$(node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync("/tmp/fish-ocean-adapter-health.json","utf8")); console.log(row.mode || "unknown");')"
node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync("/tmp/fish-ocean-adapter-health.json","utf8")); console.log(`adapter mode: ${row.mode}, liveReady: ${row.liveReady}`);'

echo "Submitting adapter smoke job"
auth_args=()
if [[ -n "${adapter_key}" ]]; then
  auth_args=(-H "authorization: Bearer ${adapter_key}")
fi
smoke_job_id="smoke_ocean_demo_stack_$(date +%s)"
curl -fsS \
  "${auth_args[@]+"${auth_args[@]}"}" \
  -H "content-type: application/json" \
  -X POST "http://127.0.0.1:${adapter_port}/jobs" \
  --data "{\"jobId\":\"${smoke_job_id}\",\"idempotencyKey\":\"${smoke_job_id}\",\"taskType\":\"document_summary\",\"inputRef\":\"sha256:smoke-ocean-demo-stack\",\"estimatedInputTokens\":100,\"maxOutputTokens\":32,\"maxRuntimeSeconds\":60,\"maxCostUsd\":1}" >/tmp/fish-ocean-adapter-job.json
ADAPTER_MODE="${adapter_mode}" node - <<'NODE'
const fs = require("fs");
const mode = process.env.ADAPTER_MODE;
const row = JSON.parse(fs.readFileSync("/tmp/fish-ocean-adapter-job.json", "utf8"));
if (mode === "dry_run") {
  if (row.status !== "failed" || row.errorCode !== "adapter_dry_run") {
    throw new Error(`expected dry-run failure, got ${row.status}/${row.errorCode || "-"}`);
  }
} else if (mode === "live" || mode === "local_ocean_node") {
  if (row.status !== "succeeded" || typeof row.outputRef !== "string" || !row.outputRef.startsWith("sha256:")) {
    throw new Error(`expected executable adapter success with sha256 outputRef, got ${row.status}/${row.errorCode || "-"}`);
  }
}
console.log(`adapter job status: ${row.status}, errorCode: ${row.errorCode || "-"}, outputRef: ${row.outputRef || "-"}`);
NODE

if curl -fsS "http://127.0.0.1:${runner_port}/healthz" >/tmp/fish-runner-health.json 2>/dev/null; then
  node -e 'const fs=require("fs"); const row=JSON.parse(fs.readFileSync("/tmp/fish-runner-health.json","utf8")); console.log(`runner: ${row.runnerId || row.id || "online"}`);'
else
  echo "Fish Runner not reachable on 127.0.0.1:${runner_port}; skip warm profile smoke."
fi

echo "Ocean demo stack smoke complete"
