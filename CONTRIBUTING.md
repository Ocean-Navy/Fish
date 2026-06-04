# Contributing To Fish

Fish is built by Ocean Navy contributors. Many contributors will use coding agents, so contributions should be small, traceable, and backed by the repository specs.

## Before You Start

Read:

- `README.md`
- `AGENTS.md`
- `PRODUCT_SPEC.md`
- the relevant feature plan in `docs/`
- `api/openapi.yaml` if you are changing an API

Fish is a community-built product layer on Ocean Protocol infrastructure. Do not present it as an official Ocean Protocol product unless maintainers explicitly approve that wording.

## Setup

Use Node.js 22.

```bash
nvm use
npm ci
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

The package is marked `"private": true` to avoid accidental npm publishing. That does not prevent the repository from being public on GitHub.

## Contribution Workflow

1. Pick a focused issue or feature area.
2. Read the matching spec or plan doc before editing code.
3. Keep changes scoped to the files needed for that task.
4. Update docs when behavior, routes, environment variables, or API shapes change.
5. Run validation before opening a PR.
6. In the PR, describe the validation you ran and any user-facing or privacy impact.

Good first contribution areas:

- UI polish on existing public routes.
- Better empty, loading, and error states.
- Small OpenAPI/doc fixes.
- Endpoint smoke tests or local verification scripts.
- Provider pilot and proof-dashboard improvements that preserve public/private boundaries.

## Validation

Default check:

```bash
npm run verify
```

Individual checks:

```bash
npm run lint
npm run typecheck
npm run build
```

For API changes, also run a local request against the changed route. For example:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/routing/policy
```

For UI changes, check the changed route on mobile and desktop widths.

## API And Documentation Rules

- Update `api/openapi.yaml` when response or request shapes change.
- Update `README.md` when setup, routes, configuration, or operator behavior changes.
- Update the relevant `docs/*.md` file when a feature contract changes.
- Keep sample, snapshot, live, and unavailable states clearly labeled.
- Do not replace precise implementation docs with broad product language.

## Privacy And Safety Rules

Do not commit:

- `.env` files or secrets.
- API keys, admin tokens, provider job keys, or signing keys.
- local JSON ledgers or form submissions.
- provider contacts, exact private endpoints, payout preferences, operator notes, or wallet references.
- raw prompt or output text in public proof files, public dashboards, or exports.

Ignored runtime paths include:

```text
data/submissions/
data/forms/
data/fish/
data/proof/
data/ocean-batch/
data/staking/
data/provider_allowlist.json
```

## Pull Request Checklist

- Scope is focused and explained.
- `npm run verify` passes or the failure is documented.
- API contract updates are included when needed.
- Docs are updated for changed behavior.
- Public copy does not imply official Ocean Protocol status.
- Sample or mock data is not labeled as live.
- Public surfaces do not expose private provider or user data.

## Open Source Readiness

Fish is licensed under the GNU Affero General Public License v3.0 or later. By contributing code or documentation to this repository, you agree that your contribution is provided under the same AGPLv3-or-later license unless maintainers explicitly document a different license for that file.

Before a public launch, maintainers should still decide whether to add `CODE_OF_CONDUCT.md`, `SECURITY.md`, and trademark guidance for Fish and Ocean Navy branding.
