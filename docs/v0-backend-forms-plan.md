# Fish V0 Backend Forms Implementation Handoff

## Scope

Build only the V0 backend support needed for the landing-page forms:

- user/developer waitlist signup;
- provider pilot application;
- checkbox-based subscriber roles;
- local file persistence for the prototype;
- OpenAPI updates matching the submitted payloads;
- a clear migration path to Postgres.

Do not scaffold a new app in this work package. The repo already has Next.js dependencies, `zod`, and `api/openapi.yaml`; the implementation should add route handlers and shared validation inside the existing app structure when the frontend is ready.

## Assumptions

- V0 form submissions are not account-bound.
- The public form surface should avoid collecting wallet addresses unless a user explicitly adds one later.
- Local file storage is acceptable for prototype and preview deployments, but production must move to Postgres before public traffic.
- The forms should accept marketing/contact consent through explicit role checkboxes instead of inferring one audience from the endpoint alone.
- Existing OpenAPI paths `/api/waitlist` and `/api/providers/apply` remain the external contract.

## Next.js API Route Design

Recommended files:

```text
app/api/waitlist/route.ts
app/api/providers/apply/route.ts
lib/forms/schemas.ts
lib/forms/store.ts
lib/forms/antiSpam.ts
lib/forms/types.ts
```

### `POST /api/waitlist`

Purpose: capture user, developer, and OCEAN-holder demand.

Request body:

```json
{
  "contact": "name@example.com",
  "useCase": "Private coding assistant for a small team",
  "expectedVolume": "1k-10k requests/month",
  "apiInterest": true,
  "oceanHolder": false,
  "subscriberRoles": ["user", "developer"],
  "notes": "Interested in OpenAI-compatible API.",
  "website": "",
  "submittedAtClient": "2026-05-31T10:00:00.000Z"
}
```

Response `200`:

```json
{
  "ok": true,
  "id": "wait_01j..."
}
```

Validation failures should return `400` with `{ "ok": false, "error": "validation_failed", "issues": [...] }`. Anti-spam rejections should return `202` with `{ "ok": true }` when the request looks automated, so bots do not get a tuning signal.

### `POST /api/providers/apply`

Purpose: capture provider pilot applications.

Request body:

```json
{
  "handle": "provider-name",
  "contact": "ops@example.com",
  "nodeEndpoint": "https://node.example.com",
  "gpuType": "H100",
  "region": "eu-west",
  "payoutPreference": "USDC",
  "subscriberRoles": ["provider"],
  "notes": "Can run benchmark jobs during the pilot.",
  "website": "",
  "submittedAtClient": "2026-05-31T10:00:00.000Z"
}
```

Response `200`:

```json
{
  "ok": true,
  "id": "prov_01j..."
}
```

### Handler Behavior

Each route should:

1. Reject non-JSON content with `415`.
2. Parse JSON with a strict max payload size target of 16 KB.
3. Run shared anti-spam checks before persistence.
4. Validate and normalize with Zod.
5. Append a normalized record to the local store.
6. Return only `{ ok, id }` to the browser.
7. Log only request id, route, result, and validation category; do not log full contact fields.

Use `export const runtime = "nodejs"` for file persistence. Avoid Edge runtime for local writes.

## Checkbox Subscriber Roles Model

Use a multi-select role model so one contact can opt into several audiences without duplicate submissions.

Allowed roles:

```ts
export const subscriberRoles = [
  "user",
  "developer",
  "provider",
  "ocean_holder",
  "ecosystem_partner"
] as const;
```

Rules:

- `subscriberRoles` is required and must contain at least one role.
- `/api/waitlist` may accept `user`, `developer`, `ocean_holder`, and `ecosystem_partner`.
- `/api/providers/apply` must include `provider`; it may also include `developer` or `ecosystem_partner`.
- Store the roles as an array in JSON and later as `text[]` or a join table in Postgres.
- Do not use role checkboxes as legal consent. If email marketing consent becomes required, add a separate `marketingConsent` boolean with timestamp and copy version.

## Zod Validation Recommendations

Create `lib/forms/schemas.ts` with shared primitives:

```ts
import { z } from "zod";

const contactSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .refine((value) => value.includes("@") || value.startsWith("@"), {
    message: "Use an email address or social handle"
  });

const roleSchema = z.enum([
  "user",
  "developer",
  "provider",
  "ocean_holder",
  "ecosystem_partner"
]);

const optionalText = z.string().trim().max(2000).optional().or(z.literal(""));
const shortText = z.string().trim().max(120).optional().or(z.literal(""));
```

Waitlist schema:

```ts
export const waitlistSchema = z.object({
  contact: contactSchema,
  useCase: optionalText,
  expectedVolume: shortText,
  apiInterest: z.boolean().default(false),
  oceanHolder: z.boolean().default(false),
  subscriberRoles: z
    .array(roleSchema)
    .min(1)
    .refine((roles) => !roles.includes("provider"), {
      message: "Provider applications must use /api/providers/apply"
    }),
  notes: optionalText,
  website: z.string().max(0).optional().or(z.literal("")),
  submittedAtClient: z.string().datetime().optional()
});
```

Provider schema:

```ts
export const providerApplicationSchema = z.object({
  handle: z.string().trim().min(2).max(80),
  contact: contactSchema,
  nodeEndpoint: z.string().trim().url().max(500).optional().or(z.literal("")),
  gpuType: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(80),
  payoutPreference: z.enum(["USDC", "OCEAN", "fiat", "undecided"]),
  subscriberRoles: z
    .array(roleSchema)
    .min(1)
    .refine((roles) => roles.includes("provider"), {
      message: "Provider applications must include provider role"
    }),
  notes: optionalText,
  website: z.string().max(0).optional().or(z.literal("")),
  submittedAtClient: z.string().datetime().optional()
});
```

Normalize empty strings to `null` before persistence where the field is semantically optional.

## Local File Storage Format

Use append-only JSON Lines so writes are simple and easy to inspect.

Recommended path:

```text
data/forms/waitlist.jsonl
data/forms/provider_applications.jsonl
```

Record shape:

```json
{
  "id": "wait_01j...",
  "kind": "waitlist",
  "createdAt": "2026-05-31T10:01:00.000Z",
  "schemaVersion": 1,
  "source": {
    "route": "/api/waitlist",
    "userAgentHash": "sha256:...",
    "ipHash": "sha256:..."
  },
  "data": {
    "contact": "name@example.com",
    "useCase": "Private coding assistant for a small team",
    "expectedVolume": "1k-10k requests/month",
    "apiInterest": true,
    "oceanHolder": false,
    "subscriberRoles": ["user", "developer"],
    "notes": "Interested in OpenAI-compatible API."
  }
}
```

Storage rules:

- Create `data/forms/` on first write.
- Use `fs.promises.appendFile` with one compact JSON object plus `\n`.
- Generate ids with `crypto.randomUUID()` or a small ULID dependency if one is already introduced.
- Hash IP and user agent with a server-side salt from `FORM_HASH_SALT`.
- Do not persist the honeypot field.
- Do not commit generated submission files. Add `data/forms/*.jsonl` to `.gitignore` when implementation begins.

Local file storage is not safe for horizontally scaled serverless production because concurrent instances may not share disk. Treat it as prototype-only.

## Anti-Spam Basics

Implement lightweight checks without blocking legitimate early interest:

- Honeypot field: include hidden `website`; reject or silently accept without storing when non-empty.
- Minimum submit time: if `submittedAtClient` is present and form age is under 2 seconds, silently accept without storing.
- Payload size cap: reject bodies above 16 KB.
- Contact normalization: lower-case email contacts; trim all strings.
- Duplicate throttle: hash normalized contact and route; if the same contact submitted in the last 10 minutes, return existing-style success without a second write.
- IP throttle: allow a small burst per IP hash, for example 5 submissions per 10 minutes per route.
- Origin check: in production, allow configured site origins from `FORM_ALLOWED_ORIGINS`.
- Avoid CAPTCHA in V0 unless spam becomes measurable; it adds friction to the main success metric.

Environment variables:

```text
FORM_HASH_SALT=required-in-prod
FORM_ALLOWED_ORIGINS=https://fish.example
FORM_STORAGE_DIR=data/forms
```

## OpenAPI Changes

Update `api/openapi.yaml` in the implementation PR so the contract reflects the role model and provider fields.

Required schema changes:

- Add `SubscriberRole` enum with `user`, `developer`, `provider`, `ocean_holder`, `ecosystem_partner`.
- Add shared `FormAcceptedResponse`.
- Add shared `FormErrorResponse`.
- Add `subscriberRoles` to both form request schemas.
- Add `handle`, `website`, and `submittedAtClient` to provider application schema.
- Rename or alias `expectedUsage` to `expectedVolume` for consistency with product copy. If frontend already uses `expectedUsage`, accept both in Zod for one release and document `expectedVolume` as canonical.
- Add `400`, `415`, and `429` response descriptions. The anti-spam silent-accept path can still return `202` or `200`; document which behavior is chosen.

Suggested component additions:

```yaml
SubscriberRole:
  type: string
  enum: [user, developer, provider, ocean_holder, ecosystem_partner]
FormAcceptedResponse:
  type: object
  required: [ok, id]
  properties:
    ok:
      type: boolean
    id:
      type: string
FormErrorResponse:
  type: object
  required: [ok, error]
  properties:
    ok:
      type: boolean
    error:
      type: string
    issues:
      type: array
      items:
        type: object
```

## Postgres Migration Path

Move from JSONL to Postgres before any public launch with meaningful traffic.

### Tables

```sql
create table form_submissions (
  id uuid primary key,
  kind text not null check (kind in ('waitlist', 'provider_application')),
  created_at timestamptz not null default now(),
  schema_version integer not null default 1,
  contact text not null,
  contact_hash text not null,
  subscriber_roles text[] not null,
  ip_hash text,
  user_agent_hash text,
  source_route text not null,
  status text not null default 'new',
  data jsonb not null
);

create index form_submissions_kind_created_at_idx
  on form_submissions (kind, created_at desc);

create index form_submissions_contact_hash_idx
  on form_submissions (contact_hash);

create unique index form_submissions_recent_dedupe_idx
  on form_submissions (kind, contact_hash, date_trunc('hour', created_at));
```

If role analytics become important, add a join table:

```sql
create table form_submission_roles (
  submission_id uuid references form_submissions(id) on delete cascade,
  role text not null,
  primary key (submission_id, role)
);
```

### Migration Steps

1. Keep the API response contract unchanged.
2. Add a storage interface with `appendSubmission(input)` and `findRecentDuplicate(input)`.
3. Implement `JsonlFormStore` first.
4. Add `PostgresFormStore` behind `FORM_STORE=postgres`.
5. Write a one-off import script that reads JSONL and inserts into `form_submissions`.
6. Run both stores in staging with a small dual-write window if needed.
7. Switch production to Postgres and retain JSONL only as local-dev fallback.

Recommended Postgres `data` JSON should keep endpoint-specific fields:

- waitlist: `useCase`, `expectedVolume`, `apiInterest`, `oceanHolder`, `notes`;
- provider: `handle`, `nodeEndpoint`, `gpuType`, `region`, `payoutPreference`, `notes`.

## Smoke-Test Cases

Run these after implementation:

1. Valid waitlist submission with `subscriberRoles: ["user"]` returns `200` and writes one JSONL row.
2. Valid waitlist submission with `subscriberRoles: ["developer", "ocean_holder"]` stores both roles.
3. Valid provider submission with `subscriberRoles: ["provider"]` returns `200` and writes one provider row.
4. Provider submission without `provider` role returns `400`.
5. Waitlist submission containing `provider` role returns `400` with a route-specific message.
6. Missing `contact` returns `400`.
7. Empty `subscriberRoles` returns `400`.
8. Invalid `nodeEndpoint` on provider route returns `400` when the field is non-empty.
9. Honeypot `website` value returns success but does not write a row.
10. Very fast bot-style submission with `submittedAtClient` under 2 seconds old returns success but does not write a row.
11. Duplicate normalized contact within the throttle window returns success and does not write a second row.
12. Non-JSON request returns `415`.
13. Oversized body returns `413` or `400`, depending on the route helper implementation.
14. Local storage directory is created automatically on the first successful write.
15. API responses never echo `contact`, IP, user agent, or notes.

Suggested manual curl checks:

```bash
curl -i http://127.0.0.1:3000/api/waitlist \
  -H 'content-type: application/json' \
  --data '{"contact":"dev@example.com","subscriberRoles":["developer"],"apiInterest":true,"website":""}'

curl -i http://127.0.0.1:3000/api/providers/apply \
  -H 'content-type: application/json' \
  --data '{"handle":"node-team","contact":"ops@example.com","gpuType":"H100","region":"eu-west","payoutPreference":"USDC","subscriberRoles":["provider"],"website":""}'
```

## Definition of Done

- `POST /api/waitlist` and `POST /api/providers/apply` are implemented as Next.js route handlers.
- Shared Zod schemas cover all form fields and role constraints.
- Local JSONL persistence writes normalized records without honeypot data.
- Anti-spam checks cover honeypot, minimum submit time, duplicate contact, IP burst, origin, and payload size.
- `api/openapi.yaml` matches the implemented payloads and responses.
- Generated submission files are ignored by git.
- Smoke tests above pass locally with `npm run smoke` plus curl or route-level tests.
