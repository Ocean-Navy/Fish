#!/usr/bin/env bash
set -euo pipefail

export FISH_OPENAI_COMPATIBLE_LABEL="${FISH_OPENAI_COMPATIBLE_LABEL:-MLX}"
export FISH_VLLM_BASE_URL="${FISH_MLX_BASE_URL:-${FISH_VLLM_BASE_URL:-http://127.0.0.1:8080/v1}}"
export FISH_VLLM_MODEL="${FISH_MLX_MODEL:-${FISH_VLLM_MODEL:-mlx-community/Llama-3.2-3B-Instruct-4bit}}"
export FISH_VLLM_API_KEY="${FISH_MLX_API_KEY:-${FISH_VLLM_API_KEY:-}}"

scripts/smoke-vllm-openai-compatible.sh
