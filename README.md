# Fish Landing Page + Ocean Network Usage Dashboard

Fish is a proposed product layer on top of **Ocean Network / Oncompute**. The core pitch is simple:

> Turn Ocean Network compute into easy AI.

This package gives agentic developers a complete starting point:

- a landing page prototype inspired by the current Fish / Ocean Navy / Venice visual direction;
- a backend that can ingest Ocean Network compute supply where public endpoints are reachable;
- a `DESIGN.md` file in the Google Labs Code `design.md` format;
- a full website specification;
- roadmap and milestone documents;
- implementation issues for agentic coders.

## What this is

A product-first website and dashboard spec for the first public version of Fish.

Fish is **not** presented as an official Ocean Protocol product. The site language should say:

> Built by Ocean Navy. Built on Ocean Protocol.

The first goal is to prove demand and usage, not to launch a token.

## Quick start prototype

```bash
cd app
python3 -m http.server 5173
```

Open:

```text
http://127.0.0.1:5173
```

For the backend dashboard proxy:

```bash
cd backend
python3 server.py
```

Open:

```text
http://127.0.0.1:8787/api/health
http://127.0.0.1:8787/api/ocean/summary
```

The static landing page will work without the backend and will show sample data. With the backend running, it will attempt to fetch live Ocean Network / Oncompute supply data and fall back to samples if unavailable.

## Repository structure

```text
DESIGN.md                      Visual identity tokens and design rationale
PRODUCT_SPEC.md                Product definition and scope
WEBSITE_SPEC.md                Page-by-page website specification
ROADMAP.md                     Implementation roadmap and milestones
AGENTIC_DEVELOPMENT_PLAN.md    Work packages for AI coding agents
DASHBOARD_SPEC.md              Ocean Network dashboard data model and UI spec
VENICE_PARITY_ROADMAP.md       Step-by-step feature roadmap inspired by Venice-style product layers
api/openapi.yaml               Backend API contract
backend/server.py              Local dashboard backend / proxy prototype
backend/ocean_supply.py        Ocean Network supply ingestion and normalization helpers
app/index.html                 Static landing page prototype
app/styles.css                 Prototype CSS using DESIGN.md tokens
app/app.js                     Frontend data-loading and sample dashboard logic
app/assets/                    Generated concept imagery and local brand placeholders
data/sample_supply.json        Sample dashboard data
issues/                        Ready-to-import agent tasks
```

## Product principle

Do not launch token promises before real usage exists.

Build in this order:

1. Market-making dashboard and landing page.
2. One simple AI app/API.
3. Selected Ocean provider pilot.
4. Usage and payout proof dashboard.
5. OCEAN staking for AI credits.
6. Provider OCEAN bonding.
7. Tokenized credits only after usage and settlement work.

## Key message

Fish should be explained in one sentence:

> Fish turns Ocean Network compute into simple AI products, so users buy AI, providers get paid, and OCEAN gains utility.

