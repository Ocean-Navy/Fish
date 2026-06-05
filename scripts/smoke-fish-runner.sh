#!/usr/bin/env bash
set -euo pipefail

runner_url="${FISH_RUNNER_BASE_URL:-http://127.0.0.1:8088}"
runner_key="${FISH_RUNNER_API_KEY:-}"
model="${FISH_RUNNER_MODEL:-fish-warm-chat}"
run_chat="${FISH_RUNNER_SMOKE_CHAT:-0}"

curl_args=(-fsS)
auth_args=()
if [[ -n "$runner_key" ]]; then
  auth_args=(-H "authorization: Bearer $runner_key")
fi

curl "${curl_args[@]}" "$runner_url/healthz" >/dev/null
curl "${curl_args[@]}" "$runner_url/models" >/dev/null

receipt_file="$(mktemp)"
chat_file="$(mktemp)"
chat_response_file="$(mktemp)"
trap 'rm -f "$receipt_file" "$chat_file" "$chat_response_file"' EXIT

if [[ "$run_chat" == "1" ]]; then
  cat > "$chat_file" <<JSON
{
  "model": "$model",
  "messages": [
    {
      "role": "user",
      "content": "Reply with one short sentence about Fish Runner."
    }
  ],
  "max_tokens": 64,
  "temperature": 0.2,
  "metadata": {
    "fish_route_id": "ocean-demo-vllm",
    "idempotency_key": "smoke-runner"
  }
}
JSON

  curl "${curl_args[@]}" "${auth_args[@]}" \
    -H "content-type: application/json" \
    -H "x-fish-route-id: ocean-demo-vllm" \
    -H "x-fish-idempotency-key: smoke-runner" \
    -X POST "$runner_url/v1/chat/completions" \
    --data @"$chat_file" >"$chat_response_file"

  node -e '
    const fs = require("node:fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const receipt = payload.fish_runner;
    if (!receipt || typeof receipt.jobId !== "string" || typeof receipt.idempotencyKey !== "string") {
      console.error("Fish Runner chat response did not include a receipt with jobId and idempotencyKey.");
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({ jobId: receipt.jobId, idempotencyKey: receipt.idempotencyKey, runnerId: receipt.runnerId, providerId: receipt.providerId }));
  ' "$chat_response_file" >"$receipt_file"

  curl "${curl_args[@]}" "${auth_args[@]}" \
    -H "content-type: application/json" \
    -X POST "$runner_url/receipts/sign" \
    --data @"$receipt_file" >/dev/null
fi

echo "Fish Runner smoke passed for $runner_url."
