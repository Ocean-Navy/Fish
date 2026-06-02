#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:${OCEAN_WORKLOAD_ADAPTER_PORT:-8787}}"
auth_args=()

if [[ -n "${OCEAN_WORKLOAD_ADAPTER_API_KEY:-}" ]]; then
  auth_args=(-H "authorization: Bearer ${OCEAN_WORKLOAD_ADAPTER_API_KEY}")
fi

echo "Checking ${base_url}/healthz"
curl -fsS "${base_url}/healthz"
echo

echo "Submitting dry-run adapter job"
curl -fsS \
  "${auth_args[@]+"${auth_args[@]}"}" \
  -H "content-type: application/json" \
  -X POST "${base_url}/jobs" \
  --data '{
    "jobId": "smoke_ocean_adapter",
    "idempotencyKey": "smoke_ocean_adapter",
    "taskType": "document_summary",
    "inputRef": "sha256:smoke-ocean-workload-adapter",
    "estimatedInputTokens": 100,
    "maxOutputTokens": 32,
    "maxRuntimeSeconds": 60,
    "maxCostUsd": 1
  }'
echo
