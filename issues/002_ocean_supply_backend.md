# Issue 002 — Build Ocean Network supply backend

## Goal

Create backend endpoints for live/fallback Ocean Network compute supply metrics.

## Inputs

- DASHBOARD_SPEC.md
- api/openapi.yaml
- backend/ocean_supply.py

## Tasks

- Implement `/api/health`.
- Implement `/api/ocean/summary`.
- Implement `/api/ocean/resources`.
- Implement `/api/ocean/providers`.
- Implement `/api/ocean/refresh`.
- Add source-state labels: live, sample, unavailable.

## Acceptance criteria

- API returns valid JSON.
- Fallback data is labeled as sample.
- Source errors are included for debugging.
- Direct node endpoints can be configured.
