# Fish Data Handling Policy

## Purpose

Fish should be clear about user data before users upload documents, repo notes, eval sets, or datasets.

The product rule is:

```text
Fish uses the order to prepare the dish.
Public proof shows tickets and hashes, not raw order data.
The route label tells the user who processed the order.
```

This is a product and implementation contract. It is not a legal privacy policy.

## Current V0 Behavior

Fish currently accepts text orders through `/api/dishes/:dishId/run` and `/v1/chat/completions`.

Current storage rules:

- Fish usage receipts store route, feature, token counts, credits, cost fields, status, latency, privacy labels, and receipt ids.
- Ocean batch receipts store job ids, task type, provider id, source state, adapter mode, usage, cost, input hash, output hash, and canonical receipt hash.
- Public proof, dashboards, exports, and receipts do not store raw prompts, raw dish input, raw files, or raw output text.
- The raw order may still be sent to the configured backend route when that route needs it to process the job.
- If outside AI is used, the outside provider policy applies.
- If a selected Ocean provider is used, that provider must be reviewed before it handles user workloads.

Current limitation:

- Fish does not yet provide a full private upload vault for larger files.
- Do not describe V0 as end-to-end encrypted, TEE-protected, cryptographically private, or invisible to Fish.

## Public-Safe Records

Long-lived public or operator records may include:

```text
account id
receipt id
batch job id
task type
dish id
route id
provider id or public provider label
source state: live / snapshot / sample / unavailable
input hash
output hash
canonical receipt hash
token counts
gpu seconds
credits spent
user charge
provider cost
privacy mode
raw prompt destination label
created/completed timestamps
status/error code
```

Long-lived public or operator records must not include:

```text
raw prompt text
raw document text
raw uploaded file content
raw output text
private provider endpoint URLs
API keys
provider private contact data
operator notes about a user or provider
wallet secrets or signing keys
```

## Upload Target Contract

When file uploads are added, use this target shape:

```text
Browser
  -> Fish upload endpoint
  -> private object storage
  -> short-lived signed inputRef
  -> Ocean batch adapter or selected provider
  -> private outputRef
  -> public-safe receipt
```

Upload rules:

- Store uploaded files in private object storage, not git, public assets, or local proof folders.
- Generate an `inputRef` that is safe to pass to a provider.
- Store an `inputHash` for proof and deduplication.
- Do not put raw file text into public receipts or usage exports.
- Use short-lived signed URLs or an equivalent private reference.
- Delete input files after job completion or within 24 hours by default.
- Keep outputs user-only and provide a manual delete path.

Recommended future env vars:

```text
FISH_INPUT_RETENTION_HOURS=24
FISH_OUTPUT_RETENTION_DAYS=30
FISH_UPLOAD_MAX_BYTES=5000000
FISH_UPLOAD_ALLOWED_TYPES=text/plain,application/pdf,text/csv,application/json
```

Do not add these env vars to production claims until the upload service actually enforces them.

## Route Labels

Every order should show the active route:

| Route | What users should understand |
| --- | --- |
| Local demo | The app generated a local demo response. |
| Outside AI | An outside provider may receive the raw order. Their policy applies. |
| Ocean demo | A configured Ocean Navy demo runner may receive the raw order. |
| Batch kitchen | Hash-only mode processes an input reference. Private artifact mode may send short order text to our private adapter. Public proof stays ticket/hash-only. |
| Selected Ocean provider | A reviewed provider may receive the raw order or input reference. |
| Hardened / TEE / E2EE | Future stronger routes only. Do not claim until implemented and verified. |

## Privacy Mode Claims

Allowed V0 claims:

```text
Public proof does not show raw order data.
Receipts store tickets, hashes, route labels, usage, credits, and cost fields.
The response labels the route that processed the order.
External provider policy applies when outside AI is used.
```

Disallowed V0 claims:

```text
No one can see your data.
Not even Fish can see your prompt.
End-to-end encrypted.
TEE protected.
Zero data retention.
Cryptographically private.
```

Use future labels only when the route has the corresponding implementation, tests, and proof:

- hardened runner;
- TEE;
- E2EE to TEE.

## Required Checks For Future Upload Work

Before a real upload feature ships:

- raw uploads are not written to `data/proof`, `data/fish`, public assets, logs, or receipts;
- public proof has only hashes and metadata;
- delete job removes private input/output objects;
- provider adapters receive only the intended `inputRef`;
- admin exports do not include raw prompt, raw output, or file content;
- sample, snapshot, and live source states remain distinct;
- UI copy does not overclaim privacy.
