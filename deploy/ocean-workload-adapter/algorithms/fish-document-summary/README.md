# Fish Docs Bento Summary

This is the first Fish Ocean workload algorithm.

It is deliberately small and dependency-free:

- If Ocean compute mounts dataset files, it reads text files and writes a short extractive summary.
- If the first proof runs with `FISH_OCEAN_DATASET_DIDS=[]`, it writes a no-dataset proof payload so Fish can prove the Ocean job executed and returned output.
- Public Fish receipts still store only hashes and metadata. Raw summary files stay in the private adapter result directory.

## Files

```text
algorithm.py
ocean-algorithm-metadata.template.json
```

The metadata template is based on the official Ocean CLI `pythonAlgo.json` example, updated for Fish and Base mainnet.

## Local Test

No dataset:

```bash
tmp="$(mktemp -d)"
FISH_ALGO_INPUT_DIRS="${tmp}/missing" \
FISH_ALGO_OUTPUT_DIR="${tmp}/out" \
python3 deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py
find "${tmp}/out" -type f -maxdepth 1 -print
```

With a local text file:

```bash
tmp="$(mktemp -d)"
mkdir -p "${tmp}/inputs"
cat > "${tmp}/inputs/demo.txt" <<'TXT'
Fish turns Ocean Network compute into simple AI meals. Users ask for a dish.
Builders call an API. Providers bring GPUs. Holders stake OCEAN.
The product keeps Ocean compute behind the counter so the user experience stays simple.
TXT
FISH_ALGO_INPUT_DIRS="${tmp}/inputs" \
FISH_ALGO_OUTPUT_DIR="${tmp}/out" \
python3 deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py
cat "${tmp}/out/fish-document-summary.json"
```

## Publish To Ocean

Prepare the Ocean CLI checkout:

```bash
scripts/bootstrap-ocean-cli.sh
export OCEAN_CLI_DIR="$(pwd)/.deps/ocean-cli"
```

Set the proof wallet and selected Ocean node:

```bash
export OCEAN_PROOF_PRIVATE_KEY="..."
export OCEAN_PROOF_RPC="https://your-base-or-base-sepolia-rpc"
export NODE_URL="/ip4/.../tcp/9000"
```

Use `FISH_ALGORITHM_CHAIN_ID=84532` for Base Sepolia testnet, or `8453` for Base mainnet.

Set a public URL for `algorithm.py`.

The Ocean node must be able to fetch this URL. The current GitHub repository is private, so a private `raw.githubusercontent.com` URL will not work. Use one of these:

- make the Fish repo public and use the raw `main` URL;
- publish `algorithm.py` as a public release asset;
- upload `algorithm.py` to IPFS or another public file URL.

Example after a public `main` merge:

```bash
export FISH_ALGORITHM_FILE_URL="https://raw.githubusercontent.com/Ocean-Navy/Fish/main/deploy/ocean-workload-adapter/algorithms/fish-document-summary/algorithm.py"
export FISH_ALGORITHM_CHAIN_ID=84532
```

Publish:

```bash
scripts/publish-fish-document-summary-algorithm.sh --env-file .env.ocean-proof.local
```

The script prepares a metadata JSON under `data/ocean-workload-adapter/` and checks that `FISH_ALGORITHM_FILE_URL` is publicly fetchable before it calls Ocean CLI.

The script prints:

```text
FISH_OCEAN_ALGO_DID=did:op:...
```

Copy that value into `.env.ocean-proof.local`.

## First Proof Configuration

For the first real proof, this algorithm can run without a dataset:

```text
FISH_OCEAN_DATASET_DIDS=[]
FISH_OCEAN_ALGO_DID=did:op:...
```

Then use `scripts/discover-oncompute-envs.mjs` to select:

```text
NODE_URL
FISH_OCEAN_COMPUTE_ENV_ID
```
