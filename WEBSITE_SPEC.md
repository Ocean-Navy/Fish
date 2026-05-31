# Website Specification: Fish

## Objective

Build a polished public website and dashboard that convinces the Ocean community that Fish is a credible product-first path to OCEAN utility.

The first website should do four jobs:

1. Explain the concept in under 30 seconds.
2. Show Ocean Network compute supply and usage metrics.
3. Recruit users, providers, and OCEAN holders into the pilot.
4. Give agentic coders a clean foundation for the full product roadmap.

## Primary URL structure

```text
/                       Landing page
/dashboard              Ocean Network supply + usage dashboard
/roadmap                Roadmap and milestones
/providers              Provider pilot page
/credits                OCEAN staking / Fish Credits explainer
/docs                   Developer docs placeholder
/api                    API status and future docs placeholder
```

V0 may implement all of these as sections on one page, but the code should be structured so they can split into pages later.

## Global header

### Desktop

Left:

- Fish logo mark.
- Fish wordmark.
- Small badge: `Ocean Navy`.

Right navigation:

- How it works
- Dashboard
- OCEAN utility
- Roadmap
- Provider pilot

CTAs:

- `View dashboard`
- `Join pilot`

### Mobile

- Fish logo.
- Menu button.
- CTAs stacked in menu.

### Header disclaimer

Small text somewhere in footer or about section:

> Community-built by Ocean Navy. Built on Ocean Protocol. Not presented as an official Ocean Protocol product unless approved.

## Landing page sections

### 1. Hero

Purpose: hook the community emotionally and explain the product.

Required content:

```text
Fish
Turn Ocean Network compute into easy AI
The fish were there all along — let’s farm and eat
```

Subcopy:

```text
Fish is one simple AI app/API that routes demand to Ocean Network providers.
```

But keep this secondary. The hero should not be text-heavy.

CTAs:

- `View live supply`
- `Join provider pilot`
- `Get updates`

Visual:

- Use `app/assets/fish-ocean-navy-venice.png` as concept artwork.
- Overlay with dark gradient for legibility.
- Use CSS fallback if image missing.

### 2. Five-step Fish flow

Purpose: explain the mechanism in one glance.

Cards:

1. `Stake OCEAN`
2. `Catch FISH`
3. `Use AI`
4. `Providers get paid`
5. `Ocean grows`

Under the cards, one plain sentence:

```text
Users buy AI. Providers get paid. OCEAN gains utility.
```

No long paragraphs.

### 3. Who benefits

Purpose: bring back the three user-group benefits without clutter.

Use three compact cards:

#### Users

```text
Easy AI
One app/API, private open AI, no provider hassle.
```

#### OCEAN holders

```text
Stake. Lock. Utility.
OCEAN can earn credits, back providers, and reduce liquid supply.
```

#### Ocean ecosystem

```text
More reach. More revenue.
More users, provider demand, and usage proof.
```

### 4. Ocean Network dashboard preview

Purpose: show this is not just a meme. Fish begins with market making.

Dashboard cards:

- `GPU supply`
- `Available GPUs`
- `Provider count`
- `H200 starting price`
- `Ocean-native jobs`
- `Provider payouts`
- `OCEAN utility metrics`

Show live/fallback status:

- Green badge: `Live data`
- Yellow badge: `Sample data`
- Red badge: `Endpoint unavailable`

Charts/tables:

- GPU supply by type.
- Top provider environments.
- Price range by GPU type.
- Latest supply snapshots.

CTA:

- `Open full dashboard`

### 5. Market-making thesis

Purpose: show the first serious workstream.

Content:

```text
Oncompute already creates the supply side. Fish packages demand.
```

Four tiles:

- Map supply.
- Benchmark providers.
- Route demand.
- Publish proof.

### 6. OCEAN utility section

Purpose: make the holder case.

Headline:

```text
Why OCEAN holders should care
```

Four cards:

1. `Stake OCEAN`
   - Lock OCEAN to earn AI credits from funded budgets.
2. `Provider bonds`
   - Providers can bond OCEAN to receive routed jobs.
3. `Credits`
   - Fish Credits turn staked OCEAN into AI access.
4. `Future support`
   - Real margin can support reserves and potential buy/lock/burn.

Required caveat:

```text
Providers are paid from real usage, reserves, or funded budgets — not by staking magic.
```

### 7. Roadmap

Purpose: show seriousness and sequence.

Roadmap cards:

1. Market-making dashboard.
2. AI API prototype.
3. Selected provider pilot.
4. Usage and payout proof.
5. OCEAN staking credits.
6. Provider bonds.
7. Venice-style feature parity.
8. Tokenized credits later.

Use a strong principle banner:

```text
Product first. Token utility after usage.
```

### 8. Provider pilot

Purpose: recruit compute providers.

Headline:

```text
Have compute? Join the first Fish provider crew.
```

Provider promise:

- routed demand;
- clear payouts;
- no unproven token payment required in V0;
- future OCEAN bonding eligibility;
- public provider scorecard.

Form fields:

- name / handle;
- email / Telegram / Discord;
- node endpoint;
- GPU type;
- region;
- payout preference;
- willing to run approved containers;
- notes.

### 9. User/developer waitlist

Purpose: recruit demand.

Form fields:

- email / handle;
- use case;
- expected usage;
- privacy need;
- interested in API keys;
- OCEAN holder yes/no.

### 10. FAQ

Initial questions:

1. Is Fish an official Ocean Protocol product?
   - Not unless approved. It is built by Ocean Navy on Ocean Protocol.
2. Is this a new token?
   - Not in V0. Fish Credits come later after usage and settlement work.
3. How are providers paid?
   - From real usage, reserves, or funded budgets.
4. Why not just pay providers directly?
   - Fish packages demand into one AI product and creates OCEAN staking/bonding/value-capture utility.
5. What comes first?
   - Market-making dashboard, then API, then provider pilot.

## Dashboard page specification

See `DASHBOARD_SPEC.md` for details.

## Accessibility

- All text must meet WCAG AA contrast.
- Buttons must have accessible labels.
- Charts must include table alternatives.
- Motion must respect `prefers-reduced-motion`.
- Images must have meaningful alt text.

## SEO metadata

Title:

```text
Fish — Turn Ocean Network compute into easy AI
```

Description:

```text
Fish is an Ocean Navy-built product concept that turns Ocean Network compute into simple AI access, provider demand, and OCEAN utility.
```

Social preview title:

```text
Fish: Easy AI on Ocean Network
```

Social preview description:

```text
Users buy AI. Providers get paid. OCEAN gains utility.
```

## Implementation target

Recommended production stack:

- Next.js App Router or equivalent modern React framework.
- TypeScript.
- Tailwind CSS generated from `DESIGN.md` tokens.
- Server-side API routes for dashboard ingestion.
- PostgreSQL for snapshots and waitlists.
- Redis/queue optional for scheduled ingestion.

Prototype stack in this package:

- Static HTML/CSS/JS landing page.
- Python backend for data ingestion proxy.
- Sample dashboard data fallback.

