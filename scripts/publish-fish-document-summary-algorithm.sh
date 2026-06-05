#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
algo_dir="${repo_root}/deploy/ocean-workload-adapter/algorithms/fish-document-summary"

if [[ "${1:-}" == "--env-file" ]]; then
  env_file="${2:-}"
  if [[ -z "${env_file}" || ! -f "${env_file}" ]]; then
    echo "--env-file requires an existing env file path." >&2
    exit 1
  fi
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" || "${line}" == \#* || "${line}" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "${key}=${value}"
  done < "${env_file}"
  shift 2
fi

if [[ -n "${1:-}" ]]; then
  metadata_file="${1}"
else
  metadata_file="$(node "${repo_root}/scripts/prepare-fish-algorithm-metadata.mjs")"
fi

if [[ -z "${PRIVATE_KEY:-}" && -n "${OCEAN_PROOF_PRIVATE_KEY:-}" ]]; then
  export PRIVATE_KEY="${OCEAN_PROOF_PRIVATE_KEY}"
fi

if [[ -z "${MNEMONIC:-}" && -n "${OCEAN_PROOF_MNEMONIC:-}" ]]; then
  export MNEMONIC="${OCEAN_PROOF_MNEMONIC}"
fi

if [[ -z "${RPC:-}" && -n "${OCEAN_PROOF_RPC:-}" ]]; then
  export RPC="${OCEAN_PROOF_RPC}"
fi

export AVOID_LOOP_RUN="${AVOID_LOOP_RUN:-true}"

if [[ -z "${OCEAN_CLI_DIR:-}" ]]; then
  echo "OCEAN_CLI_DIR is required. Run scripts/bootstrap-ocean-cli.sh first." >&2
  exit 1
fi

if [[ "${OCEAN_CLI_DIR}" != /* ]]; then
  OCEAN_CLI_DIR="${repo_root}/${OCEAN_CLI_DIR}"
fi

if [[ ! -d "${OCEAN_CLI_DIR}" && "${OCEAN_CLI_DIR}" == "/ocean-cli" && -d "${repo_root}/.deps/ocean-cli" ]]; then
  OCEAN_CLI_DIR="${repo_root}/.deps/ocean-cli"
fi

if [[ -z "${PRIVATE_KEY:-}" && -z "${MNEMONIC:-}" ]]; then
  echo "PRIVATE_KEY or MNEMONIC is required to publish the Ocean algorithm asset." >&2
  exit 1
fi

for required in RPC NODE_URL; do
  if [[ -z "${!required:-}" ]]; then
    echo "${required} is required to publish the Ocean algorithm asset." >&2
    exit 1
  fi
done

if [[ ! -d "${OCEAN_CLI_DIR}" ]]; then
  echo "OCEAN_CLI_DIR does not exist: ${OCEAN_CLI_DIR}" >&2
  exit 1
fi

set +e
output="$(cd "${OCEAN_CLI_DIR}" && npm run cli publishAlgo "${metadata_file}" 2>&1)"
status=$?
set -e
echo "${output}"

if [[ "${status}" -ne 0 ]]; then
  echo "Ocean CLI publishAlgo failed with exit code ${status}." >&2
  exit "${status}"
fi

did="$(printf '%s\n' "${output}" | grep -Eo 'did:op:[a-f0-9]{64}' | tail -n 1 || true)"
if [[ -z "${did}" ]]; then
  echo "Could not find algorithm DID in Ocean CLI output." >&2
  exit 1
fi

echo
echo "Add this to .env.ocean-proof.local:"
echo "FISH_OCEAN_ALGO_DID=${did}"
