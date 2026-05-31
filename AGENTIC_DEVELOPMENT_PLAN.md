# Agentic Development Plan

## How to use this with coding agents

Each agent should receive:

1. `DESIGN.md`
2. `PRODUCT_SPEC.md`
3. `WEBSITE_SPEC.md`
4. the relevant issue file from `/issues`
5. the API contract from `api/openapi.yaml` if backend work is needed

Agents should not invent new product strategy. They should implement the specification and open questions should be returned as TODOs.

## Workstreams

### Agent 1 — Design system and landing shell

Input:

- `DESIGN.md`
- `WEBSITE_SPEC.md`
- `app/index.html`
- `app/styles.css`

Tasks:

- Convert prototype into production framework.
- Implement responsive sections.
- Create reusable components: Hero, FlowCards, BenefitStrip, DashboardPreview, Roadmap, CTA.
- Ensure all text follows ELI5 copy.

Acceptance:

- mobile and desktop render correctly;
- all colors match tokens;
- no Ocean Protocol official-product implication;
- hero uses Fish / Ocean Navy identity.

### Agent 2 — Dashboard backend

Input:

- `DASHBOARD_SPEC.md`
- `api/openapi.yaml`
- `backend/ocean_supply.py`

Tasks:

- Implement live supply ingestion.
- Store snapshots.
- Normalize resources.
- Label live/sample/unavailable states.
- Return dashboard summary and tables.

Acceptance:

- `/api/ocean/summary` works;
- `/api/ocean/resources` works;
- fallback is explicit;
- no sample data is mislabeled as live.

### Agent 3 — Dashboard frontend

Input:

- `DASHBOARD_SPEC.md`
- `DESIGN.md`

Tasks:

- Build KPI cards.
- Build GPU supply table.
- Build provider scorecard.
- Build refresh/status UI.
- Add chart placeholders with table fallback.

Acceptance:

- dashboard can use backend or sample data;
- error states are clear;
- loading states are polished;
- all metrics explain source and timestamp.

### Agent 4 — Forms and community funnel

Tasks:

- Provider pilot form.
- User/developer waitlist form.
- Form validation.
- Anti-spam basics.
- Storage adapter: file/local first, database later.

Acceptance:

- form entries are persisted or sent to backend;
- success state exists;
- no sensitive data is logged in frontend console.

### Agent 5 — Roadmap and docs UI

Tasks:

- Render roadmap from JSON or markdown.
- Render FAQ.
- Render “why OCEAN utility matters.”
- Render Venice parity roadmap.

Acceptance:

- roadmap is easy to scan;
- no token promises before usage;
- all caveats are visible.

### Agent 6 — Future AI API prototype

Not required for first landing page, but next.

Tasks:

- `/v1/chat/completions`
- `/v1/models`
- `/v1/usage`
- `/v1/balance`
- API key creation.
- Usage receipts.

Acceptance:

- OpenAI-compatible enough for a basic SDK call;
- usage is metered;
- credits debit safely.

## Shared coding rules

- Use TypeScript for production frontend/backend where possible.
- Use strict typing.
- Keep UI copy in a `content.ts` or JSON file.
- Keep sample data clearly marked.
- Do not hardcode fake live data.
- Do not add legal/financial promises without human review.
- Never claim guaranteed yield.
- Never claim official Ocean Protocol status unless explicitly approved.

## Suggested first sprint

### Day 1–2

- Import package into GitHub.
- Create issues.
- Validate `DESIGN.md`.
- Choose production stack.

### Day 3–5

- Convert static prototype into production app.
- Implement dashboard backend endpoints.
- Wire dashboard preview.

### Day 6–7

- Add forms.
- Polish mobile.
- Publish first demo.
- Ask providers to join pilot.

