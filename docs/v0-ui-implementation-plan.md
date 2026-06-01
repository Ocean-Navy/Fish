# Fish V0 UI Implementation Plan

## Scope

This handoff maps `WEBSITE_SPEC.md` and `DESIGN.md` into a production V0 Next.js/Tailwind UI implementation. It is intentionally limited to UI architecture, component boundaries, responsive behavior, content, accessibility, and launch caveats. It does not scaffold the app.

Baseline assumptions:

- Production UI should use Next.js App Router, TypeScript, and Tailwind CSS.
- Existing `tailwind.config.ts` already contains the core Fish color tokens and should be extended, not replaced.
- The concept artwork is available at `public/assets/fish-ocean-navy-venice.png`. `WEBSITE_SPEC.md` mentions `app/assets/...`; use the existing public asset path unless the image is moved during implementation.
- The current static prototype under `legacy/static-prototype/` is reference material only. Do not port it wholesale without applying the production component structure below.
- V0 may ship all public URL targets as sections on `/`, but code should be split so `/boxes`, `/dashboard`, `/roadmap`, `/providers`, `/credits`, `/docs`, and `/api` can become real routes without rewriting content.

## Delivery Target

Build a polished public website that does four jobs quickly:

- Explain Fish in under 30 seconds.
- Show Ocean Network compute supply and usage proof honestly.
- Recruit users, providers, developers, and OCEAN holders into the pilot.
- Create a clean product foundation for later dashboard, API, provider, credit, and roadmap pages.

The page should feel like a serious Ocean Navy product with a memorable mascot. Keep copy short, concrete, and plain. Do not make it look like a meme-token landing page.

## Proposed File Structure

Use this structure when app work begins:

```text
app/
  layout.tsx
  page.tsx
  dashboard/page.tsx
  roadmap/page.tsx
  providers/page.tsx
  credits/page.tsx
  docs/page.tsx
  api/page.tsx
  globals.css
components/
  site/
    SiteHeader.tsx
    MobileMenu.tsx
    SiteFooter.tsx
    SectionShell.tsx
  landing/
    HeroSection.tsx
    FishFlowSection.tsx
    BenefitsSection.tsx
    DashboardPreviewSection.tsx
    MarketMakingSection.tsx
    OceanUtilitySection.tsx
    RoadmapSection.tsx
    ProviderPilotSection.tsx
    WaitlistSection.tsx
    FaqSection.tsx
  dashboard/
    DataStateBadge.tsx
    KpiCard.tsx
    GpuSupplyTable.tsx
    ProviderScorecardTable.tsx
    DashboardStatusHeader.tsx
  forms/
    ProviderPilotForm.tsx
    WaitlistForm.tsx
    SubscriberRoles.tsx
  ui/
    Button.tsx
    Card.tsx
    Badge.tsx
    Field.tsx
    Checkbox.tsx
lib/
  copy.ts
  dashboard-types.ts
  dashboard-format.ts
```

V0 can render the landing sections from `app/page.tsx` and make secondary routes lightweight wrappers around the same section components. Example: `/providers` can render `ProviderPilotSection` plus the footer; `/credits` can render `OceanUtilitySection` plus FAQ caveats.

## Design Tokens

Extend the current Tailwind config with production-safe aliases from `DESIGN.md`:

- Backgrounds: `fish.navy950`, `fish.navy900`, `fish.navy800`, `fish.surface`, `fish.raised`.
- Text: `fish.primary`, `fish.secondary`, `fish.muted` if added.
- Action colors: `fish.accent`, `fish.aqua`.
- Status colors: `fish.success`, `fish.gold`, `fish.coral`.
- Utility accents: `fish.purple`, `fish.gold`.

Implementation notes:

- Use dark layered navy gradients for page backgrounds, never flat black.
- Use glass cards with `bg-fish-surface/75`, `border border-fish-accent/25`, and subtle hover glows.
- Prefer `rounded-2xl` to match the existing design direction, but keep dense dashboard controls at `rounded-lg` or `rounded-xl`.
- Use Inter/system sans. Do not add a custom font dependency for V0 unless already approved.
- Do not scale font size directly with viewport width in custom CSS. Use Tailwind responsive classes or fixed `clamp()` values from the design token spec only where unavoidable for hero display type.
- Avoid negative letter spacing beyond the existing display treatment. Body, buttons, forms, and dashboard labels should use normal tracking except uppercase micro-labels.

## Global Layout

### Header

Component: `components/site/SiteHeader.tsx`

Desktop content:

- Left: Fish mark, Fish wordmark, `Ocean Navy` badge.
- Right nav: `How it works`, `Dashboard`, `OCEAN utility`, `Roadmap`, `Provider pilot`.
- CTAs: `View dashboard`, `Join pilot`.

Mobile content:

- Fish mark and wordmark.
- Menu button with accessible label `Open navigation`.
- Slide-down or drawer menu with the same nav links.
- CTAs stacked full-width inside the menu.
- Close button with accessible label `Close navigation`.

Behavior:

- Header should be sticky with translucent navy background and blur.
- Use anchor links on `/` and route-aware links on secondary pages.
- Keep focus visible for all nav links and buttons.

### Footer

Component: `components/site/SiteFooter.tsx`

Must include:

```text
Fish is a community concept by Ocean Navy, built on Ocean Protocol. Not an official Ocean Protocol product unless approved.
```

Also include the principle:

```text
Product first. Token utility after usage.
```

Footer links can point to `/dashboard`, `/roadmap`, `/providers`, `/credits`, `/docs`, and `/api`, even if those pages are placeholders in V0.

## SEO and Metadata

Set metadata in `app/layout.tsx` or route-level metadata exports.

Landing title:

```text
Fish - Turn Ocean Network compute into easy AI
```

Landing description:

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

Metadata requirements:

- Use the artwork as the Open Graph image only if the crop is legible at social-preview sizes.
- Include canonical URLs once the deployment domain is known.
- Keep the official-status disclaimer visible in page content; metadata should not imply official Ocean Protocol status.
- Secondary route metadata should be specific, for example `/providers` should target provider-pilot recruitment and `/credits` should target OCEAN utility education.

## Landing Page Section Plan

### 1. Hero

Component: `HeroSection`

Required copy:

```text
Fish
Turn Ocean Network compute into easy AI
The fish were there all along - let's farm and eat
Fish is one simple AI app/API that routes demand to Ocean Network providers.
```

Builder label:

```text
Built by Ocean Navy on Ocean Protocol
```

CTAs:

- Primary: `View live supply` -> `#dashboard` or `/dashboard`.
- Secondary: `Join provider pilot` -> `#provider-pilot` or `/providers`.
- Tertiary/link: `Get updates` -> `#waitlist`.

Visual:

- Use `next/image` with `/assets/fish-ocean-navy-venice.png`.
- Alt text: `Fish Ocean Navy concept artwork with a geometric dolphin captain in a Venice canal setting`.
- Apply a dark navy gradient overlay for text legibility if the image is full-bleed or behind copy.
- Provide CSS fallback: dark navy gradient panel with fish mark if the image fails.

Layout:

- Desktop: two-column or full-bleed hero with copy over the left/lower image area.
- Mobile: copy first, artwork below or as background with strong overlay. Keep the first screen focused on the product name and headline.
- Keep the hero short; do not add long technical explanation.

### 2. Five-Step Fish Flow

Component: `FishFlowSection`

Cards:

1. `Stake OCEAN`
2. `Catch FISH`
3. `Use AI`
4. `Providers get paid`
5. `Ocean grows`

Under-card sentence:

```text
Users buy AI. Providers get paid. OCEAN gains utility.
```

Implementation:

- Use five compact cards only.
- No paragraphs inside cards. Optional micro-labels are allowed but should stay under six words.
- Desktop: five equal columns.
- Tablet: 3 + 2 grid.
- Mobile: horizontal snap row or single-column stack. If snap row is used, provide visible overflow hints and do not hide focus outlines.

### 3. Who Benefits

Component: `BenefitsSection`

Cards:

- Users: `Easy AI` / `One app/API, private open AI, no provider hassle.`
- OCEAN holders: `Stake. Lock. Utility.` / `OCEAN can earn credits, back providers, and reduce liquid supply.`
- Ocean ecosystem: `More reach. More revenue.` / `More users, provider demand, and usage proof.`

Implementation:

- Three compact cards with icon circles. Use `lucide-react` icons rather than emoji.
- Suggested icons: `User`, `Coins`, `Network` or `Waves`.
- Keep provider benefits for the provider-pilot section to avoid clutter.

### 4. Ocean Network Dashboard Preview

Component: `DashboardPreviewSection`

Purpose:

- Show that Fish begins with market making and measurable supply.
- Present data states honestly.

Status badge mapping:

- `live` -> green `Live data`.
- `snapshot` -> cyan or blue `Snapshot data`.
- `sample` -> yellow `Sample data`.
- `unavailable` -> red `Endpoint unavailable`.

KPI cards:

- `GPU supply`
- `Available GPUs`
- `Provider count`
- `H200 starting price`
- `Ocean-native jobs`
- `Provider payouts`
- `OCEAN utility metrics`

Tables/charts:

- GPU supply by type.
- Top provider environments.
- Price range by GPU type.
- Latest supply snapshots.

Data contract:

- Read from `/api/ocean/summary` once available.
- Match `api/openapi.yaml` names: `dataState`, `lastUpdated`, `kpis.totalGpus`, `kpis.availableGpus`, `kpis.providerCount`, `kpis.h200FromUsdHr`, `kpis.oceanNativeJobs`, `kpis.providerPayoutUsd`, `gpuSupply`, `providers`.
- If local fallback is needed, use `public/data/sample_supply.json` and show `Sample data` clearly.
- Never label sample or placeholder numbers as live.

Accessibility:

- Any chart must have a table alternative in the same section.
- Status badge text must not rely on color alone.
- Refresh action should be a real `<button>` with loading and error states.

CTA:

- `Open full dashboard` -> `/dashboard`.

### 5. Market-Making Thesis

Component: `MarketMakingSection`

Lead copy:

```text
Oncompute already creates the supply side. Fish packages demand.
```

Tiles:

- `Map supply`
- `Benchmark providers`
- `Route demand`
- `Publish proof`

Implementation:

- Four tiles in a 4-column desktop grid, 2-column tablet grid, single-column mobile stack.
- Use this section as the conceptual bridge between the dashboard preview and provider recruitment.
- Avoid long explanations; each tile can have a one-line implementation proof point.

### 6. OCEAN Utility

Component: `OceanUtilitySection`

Headline:

```text
Why OCEAN holders should care
```

Cards:

- `Stake OCEAN`: `Lock OCEAN to earn AI credits from funded budgets.`
- `Provider bonds`: `Providers can bond OCEAN to receive routed jobs.`
- `Credits`: `Fish Credits turn staked OCEAN into AI access.`
- `Future support`: `Real margin can support reserves and potential buy/lock/burn.`

Required caveat:

```text
Providers are paid from real usage, reserves, or funded budgets - not by staking magic.
```

Launch-copy caveats:

- Do not imply guaranteed yield.
- Do not imply providers are paid by staking alone.
- Do not imply a new token exists in V0.
- Do not promise buy, lock, burn, or reserves as committed mechanics.
- Use `potential`, `future`, or `once implemented` for mechanics that require usage, settlement, or contracts.

### 7. Roadmap

Component: `RoadmapSection`

Principle banner:

```text
Product first. Token utility after usage.
```

Cards:

1. `Market-making dashboard`
2. `AI API prototype`
3. `Selected provider pilot`
4. `Usage and payout proof`
5. `OCEAN staking credits`
6. `Provider bonds`
7. `Venice-style feature parity`
8. `Tokenized credits later`

Implementation:

- Show sequence, not promises.
- Use numbered cards or a vertical timeline.
- Mobile should render as a simple ordered list with visible numbers.
- Add a small `Status` line per card only if product status is available. Otherwise omit status labels.

### 8. Provider Pilot

Component: `ProviderPilotSection`

Headline:

```text
Have compute? Join the first Fish provider crew.
```

Provider promise bullets:

- Routed demand.
- Clear payouts.
- No unproven token payment required in V0.
- Future OCEAN bonding eligibility.
- Public provider scorecard.

Fields:

- `nameOrHandle`
- `contact` for email, Telegram, or Discord
- `nodeEndpoint`
- `gpuType`
- `region`
- `payoutPreference`
- `runsApprovedContainers` boolean
- `notes`

Submission:

- POST to `/api/providers/apply` when available.
- V0 fallback may log or file-write locally, but UI must tell the user if the backend is unavailable.
- Required fields should be `contact` and at least one provider identifier (`nodeEndpoint` or `gpuType`).

### 9. User and Developer Waitlist

Component: `WaitlistSection`

Purpose:

- Recruit demand before the API is live.
- Segment subscribers without creating multiple forms.

Fields:

- `contact`
- `useCase`
- `expectedUsage`
- `privacyNeed`
- `apiInterest`
- `oceanHolder`
- `subscriberRoles`

Checkbox-based subscriber roles:

- `User`
- `Developer`
- `Compute provider`
- `OCEAN holder`
- `Community contributor`

UI requirements:

- Render roles as checkboxes, not a single-select dropdown, because one person can be both a developer and an OCEAN holder.
- Use a `<fieldset>` with `<legend>What are you interested in?</legend>`.
- Persist roles as an array of stable string IDs, for example `["developer", "ocean_holder"]`.
- Do not require users to pick exactly one role.
- Include inline helper text: `Choose all that apply.`

Submission:

- POST to `/api/waitlist`.
- Match current OpenAPI where possible, but extend the future request shape with `privacyNeed` and `subscriberRoles`.
- Show success, error, pending, and backend-unavailable states.

### 10. FAQ

Component: `FaqSection`

Questions and answers:

- `Is Fish an official Ocean Protocol product?` / `Not unless approved. It is built by Ocean Navy on Ocean Protocol.`
- `Is this a new token?` / `Not in V0. Fish Credits come later after usage and settlement work.`
- `How are providers paid?` / `From real usage, reserves, or funded budgets.`
- `Why not just pay providers directly?` / `Fish packages demand into one AI product and creates OCEAN staking, bonding, and value-capture utility.`
- `What comes first?` / `Market-making dashboard, then API, then provider pilot.`

Implementation:

- Use semantic buttons for accordion toggles if collapsed.
- Keep all FAQ answers available to screen readers.
- Default expanded is acceptable for V0 if simpler.

## Secondary Routes

V0 can ship these as sections, but reserve the route names:

- `/dashboard`: full Ocean Network supply dashboard. Start with status header, KPI cards, GPU supply table, provider scorecard, usage proof placeholder, and OCEAN utility proof placeholder.
- `/boxes`: pilot AI boxes for Ask, Code, Explain, Summarize, Proposal Writer, and Ocean Helper, powered by the `/v1/chat/completions` contract with visible route and credit feedback.
- `/roadmap`: roadmap cards plus principle banner and launch caveats.
- `/providers`: provider pilot form, provider promise, eligibility notes, scorecard explanation.
- `/credits`: OCEAN staking, provider bonds, credits, and future-support explanation with caveats.
- `/docs`: developer docs placeholder with expected API key, model routing, and provider receipt docs.
- `/api`: API status and future docs placeholder. Link to OpenAPI when published.

If only `/` is implemented in V0, header links should still work through anchors and footer links should not lead to dead pages unless placeholders exist.

## Mobile Behavior

Breakpoints:

- `sm`: phone layout, single-column sections, compact typography.
- `md`: two-column cards where space permits.
- `lg`: full desktop header, dashboard grids, and hero split layout.

Specific behavior:

- Header nav collapses below `lg`.
- Hero copy must remain readable over or beside artwork; add overlay if image sits behind text.
- CTA buttons stack full-width on narrow screens.
- Five-step flow can stack or use horizontal snap. If horizontal snap is used, keyboard focus must scroll items into view.
- Dashboard KPI grid: 2 columns on mobile, 3 on tablet, 4 or 7 on desktop depending available width. Avoid squeezing seven cards into unreadable columns.
- Tables must use horizontal overflow wrappers with sticky first column only if implemented accessibly.
- Forms use single-column fields on mobile and two-column grouping only on desktop.
- No text should overlap artwork, cards, controls, or badges at 320px width.

## Accessibility Requirements

Minimum bar:

- WCAG AA contrast for all text and controls.
- Real landmarks: `header`, `nav`, `main`, `section`, `footer`.
- One `h1` on each page. Landing `h1` is `Fish`.
- Logical heading order.
- Buttons and links must have clear accessible names.
- Focus styles visible on all interactive elements.
- Forms must use labels, fieldsets, legends, error messages, and status regions.
- Charts must have table alternatives.
- Data-state badges must include text and not depend on color alone.
- Images must have meaningful alt text unless decorative.
- Respect `prefers-reduced-motion`; disable parallax, animated glows, and auto-moving effects when reduced motion is requested.
- Use `aria-live="polite"` for form submission and dashboard refresh status.
- Avoid emoji as meaningful UI icons; use `lucide-react` icons with accessible names or mark decorative icons as hidden.

## Launch Copy Caveats

These are hard copy rules for V0:

- Say `built on Ocean Protocol`, not `official Ocean Protocol product`, unless approval exists.
- Say `Ocean Navy-built`, `community concept`, or `community-built by Ocean Navy`.
- Say `Fish Credits come later after usage and settlement work`.
- Say `Providers are paid from real usage, reserves, or funded budgets`.
- Do not say or imply `guaranteed yield`.
- Do not say providers are paid by staking alone.
- Do not make WATER/FISH token promises.
- Do not claim live data when using sample or cached data.
- Do not present future buy/lock/burn support as active or guaranteed.

## Component Acceptance Checklist

- [ ] `SiteHeader` renders desktop nav, mobile menu, `Ocean Navy` badge, and two CTAs.
- [ ] `HeroSection` uses the Fish artwork, required hero copy, three CTAs, and a legible image overlay or fallback.
- [ ] `FishFlowSection` has exactly five steps and the required summary sentence.
- [ ] `BenefitsSection` has the three required audience cards.
- [ ] `DashboardPreviewSection` shows KPI cards, data-state badge, table alternatives, fallback warning, and full dashboard CTA.
- [ ] `MarketMakingSection` includes the required lead sentence and four thesis tiles.
- [ ] `OceanUtilitySection` includes four utility cards and the required provider-payment caveat.
- [ ] `RoadmapSection` includes eight roadmap steps and the principle banner.
- [ ] `ProviderPilotSection` includes all provider fields and handles unavailable backend state.
- [ ] `WaitlistSection` includes checkbox-based subscriber roles and persists them as an array.
- [ ] `FaqSection` includes the five required initial FAQs.
- [ ] Footer includes the official-status disclaimer.
- [ ] Mobile layout works at 320px, 375px, 768px, and desktop widths.
- [ ] All placeholder, sample, snapshot, and live data states are visually and textually distinct.
- [ ] No V0 copy implies guaranteed yield, official Ocean Protocol status, or live token mechanics.

## Suggested Implementation Order

1. Add global layout, metadata, Tailwind token extensions, and `globals.css` background/elevation utilities.
2. Build `SiteHeader`, `SiteFooter`, `Button`, `Card`, `Badge`, `Field`, and `Checkbox`.
3. Build landing sections with static copy and artwork.
4. Build dashboard preview using typed mock/sample data and the OpenAPI field names.
5. Build provider and waitlist forms with local validation and accessible status states.
6. Add placeholder secondary routes or anchor-safe navigation.
7. Run responsive and accessibility QA.

## QA Checklist

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Landing page smoke test in browser.
- [ ] Mobile browser check at 320px and 375px.
- [ ] Tablet check around 768px.
- [ ] Desktop check at 1440px.
- [ ] Keyboard-only navigation through header, CTAs, forms, FAQ, and refresh button.
- [ ] Reduced-motion check.
- [ ] Dashboard sample-data fallback check.
- [ ] Backend-unavailable form state check.
- [ ] Copy review against launch caveats.
