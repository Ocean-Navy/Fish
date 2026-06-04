#!/usr/bin/env bash
set -euo pipefail

base_url="${FISH_VLLM_BASE_URL:-http://127.0.0.1:8000/v1}"
model="${FISH_VLLM_MODEL:-}"
api_key="${FISH_VLLM_API_KEY:-}"

if [[ -z "$model" ]]; then
  echo "Set FISH_VLLM_MODEL to the served model name, for example fish-warm-chat." >&2
  exit 2
fi

curl_args=(-fsS)
if [[ -n "$api_key" ]]; then
  curl_args+=(-H "authorization: Bearer $api_key")
fi

payload_file="$(mktemp)"
trap 'rm -f "$payload_file"' EXIT

cat > "$payload_file" <<JSON
{
  "model": "$model",
  "messages": [
    {
      "role": "user",
      "content": "Reply with exactly one short sentence about Fish warm inference."
    }
  ],
  "max_tokens": 64,
  "temperature": 0.2
}
JSON

curl "${curl_args[@]}" "$base_url/models" >/dev/null
curl "${curl_args[@]}" \
  -H "content-type: application/json" \
  -X POST "$base_url/chat/completions" \
  --data @"$payload_file" >/dev/null

echo "vLLM OpenAI-compatible smoke passed for $base_url using model $model."
