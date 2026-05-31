# Issue 004 — Provider pilot and user waitlist forms

## Goal

Capture interest from providers and users.

## Tasks

- Provider form fields: handle, contact, node endpoint, GPU type, region, payout preference, notes.
- User form fields: contact, use case, expected volume, API interest, OCEAN holder yes/no.
- Basic validation.
- Backend endpoint or static capture adapter.
- Success and error states.

## Acceptance criteria

- Form cannot submit empty required fields.
- Data is persisted locally or sent to configured backend.
- UI makes clear this is a pilot signup, not a financial product.
