#!/usr/bin/env bash
set -euo pipefail

target="${1:-.deps/ocean-cli}"
repo_url="${OCEAN_CLI_REPO_URL:-https://github.com/oceanprotocol/ocean-cli.git}"

if [[ -d "${target}/.git" ]]; then
  git -C "${target}" pull --ff-only
else
  mkdir -p "$(dirname "${target}")"
  git clone "${repo_url}" "${target}"
fi

if [[ -f "${target}/package-lock.json" ]]; then
  npm --prefix "${target}" ci
else
  npm --prefix "${target}" install
fi

npm --prefix "${target}" run build

absolute_target="$(cd "${target}" && pwd)"
echo "Ocean CLI checkout is ready:"
echo "OCEAN_CLI_DIR=${absolute_target}"
