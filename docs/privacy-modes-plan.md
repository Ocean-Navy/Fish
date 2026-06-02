# Privacy Modes Plan

## Purpose

Fish should be honest about privacy from the first API surface. The current prototype stores usage numbers, cost fields, and request hashes, but a raw prompt may still be sent to a configured external backend. Stronger privacy comes only when selected Ocean providers, hardened runners, and eventually attested environments exist.

This plan defines a staged privacy ladder. It is product guidance and implementation contract language, not a claim that all tiers exist today.

Current prototype status: `/v1/chat/completions`, `/api/dishes/:dishId/run`, `/v1/usage`, and `/v1/balance` usage receipts now expose a public-safe `privacy` object. It records the requested privacy mode, accepted route privacy mode, downgrade reason when explicitly allowed, raw prompt destination, and `storesPromptText=false` / `storesOutputText=false`.

## Principles

- Do not call V1 cryptographically private.
- Do not store raw prompt or output text in receipts, public proof, billing rows, exports, or dashboards.
- Make the active route visible: mock, external fallback, selected Ocean provider, hardened runner, or TEE.
- Match privacy claims to the real route used for the request.
- Prefer clear "what happens to your prompt" copy over abstract privacy language.
- Treat provider logging policy as a contract item before routing user workloads.

## Privacy Ladder

```text
external
-> ocean_private_policy
-> ocean_hardened
-> ocean_tee
-> e2ee_to_tee
```

### Tier 1 - External

Requests are sent to an external OpenAI-compatible backend when configured.

User-facing claim:

```text
External fallback. The external provider policy applies.
```

Requirements:

- receipt route is `external-fallback`;
- receipts store hashes and usage, not prompt text;
- account and proof pages label fallback separately from Ocean-native routes;
- docs explain that the external backend receives the raw prompt.

### Tier 2 - Ocean Private Policy

Requests are routed to selected Ocean providers that agree to no-log or limited-log policy terms.

User-facing claim:

```text
Selected Ocean provider with no-log policy.
```

Requirements:

- provider is selected and allowlisted;
- provider policy is reviewed before routing;
- proof shows provider id or public label;
- receipts remain prompt-free;
- operator can pause providers that violate policy.

### Tier 3 - Ocean Hardened

Requests run through approved containers or runners with stricter telemetry, redaction, and operational controls.

User-facing claim:

```text
Hardened Ocean runner with restricted telemetry.
```

Requirements:

- runner config is reviewed;
- logs are redacted by default;
- telemetry is limited to usage, timing, health, and receipt fields;
- smoke tests verify no prompt/output text lands in public or operator exports;
- incident process exists for suspected retention.

### Tier 4 - Ocean TEE

Requests run inside a hardware-attested provider environment.

User-facing claim:

```text
Attested Ocean environment.
```

Requirements:

- attestation evidence is captured and verified;
- model/runtime measurement is documented;
- provider receipt includes attestation reference;
- failed attestation downgrades or blocks routing;
- security review is complete.

### Tier 5 - E2EE To TEE

Prompts are encrypted client-side and decrypted only inside a verified enclave.

User-facing claim:

```text
Client-encrypted to verified enclave.
```

Requirements:

- client encryption is implemented and audited;
- key exchange is bound to attestation;
- plaintext is unavailable to Fish gateway outside the enclave path;
- fallback routes cannot silently downgrade this tier;
- UX clearly shows when a request cannot use this mode.

## Request And Receipt Fields

Future request metadata:

```text
requestedPrivacyMode
allowPrivacyDowngrade
acceptedPrivacyMode
privacyDowngradeReason
route
providerId
runnerId
attestationRef
storesPromptText=false
storesOutputText=false
```

Receipts should record the accepted privacy mode and any downgrade reason. Public views should show the mode label and route, but never raw prompt or output text.

Prototype metadata keys:

```json
{
  "metadata": {
    "requestedPrivacyMode": "selected_ocean_policy",
    "allowPrivacyDowngrade": false
  }
}
```

If the requested mode is unavailable, Fish returns `privacy_mode_unavailable`. Setting `allowPrivacyDowngrade` to `true` lets Fish continue and records `privacyDowngradeReason`.

## Downgrade Policy

- Never silently downgrade from TEE or E2EE to external fallback.
- If a requested privacy mode is unavailable, return a clear error unless the user explicitly allowed fallback.
- Account and receipt views should show the final accepted privacy mode.
- Billing should not charge premium privacy pricing if a request downgraded.
- Provider scorecards should include privacy-policy violations as a routing risk.

## Public Page Requirements

The `/docs` page should show the ladder in simple terms:

- External fallback means external policy applies.
- Ocean private policy means selected provider terms are reviewed.
- Hardened means approved runner and restricted telemetry.
- TEE and E2EE-to-TEE are later, stronger tiers.
- Fish should not claim cryptographic privacy until those tiers exist.

## Definition Of Done

- Privacy ladder is documented with user-facing claims and implementation requirements.
- Docs distinguish current prototype behavior from future provider/TEE modes.
- Proof, account, and billing plans agree that prompt/output text stays out of stored records.
- Routing work has clear downgrade and receipt fields to implement, and the current chat/API receipts already expose the prototype privacy object.

## Open Questions

- Which selected providers can commit to no-log policy first?
- What telemetry is required for support without leaking prompt content?
- Which TEE stack would Ocean providers realistically support?
- Should users choose privacy mode per request, per account, or per API key?
- How should pricing differ between external, Ocean private, hardened, and TEE routes?
