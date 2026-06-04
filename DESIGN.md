---
version: "alpha"
name: "Fish Ocean Navy"
description: "A premium ocean-tech identity for an Ocean Navy-built AI product on top of Ocean Network compute."
colors:
  primary: "#EAF7FF"
  secondary: "#8DB8D8"
  accent: "#12D8FF"
  accent-strong: "#22F0D2"
  navy-950: "#020A1E"
  navy-900: "#06152E"
  navy-800: "#0A2346"
  ocean-700: "#064B77"
  cyan-400: "#12D8FF"
  aqua-400: "#22F0D2"
  gold-400: "#F8C66A"
  coral-400: "#FF5C98"
  purple-500: "#7C5CFF"
  success-400: "#73F7A7"
  warning-400: "#F8C66A"
  surface: "#071A33"
  surface-raised: "#0B2446"
  surface-glass: "#0A1E3ACC"
  border: "#1E6C93"
  border-bright: "#18C7E8"
  on-primary: "#020A1E"
  on-dark: "#EAF7FF"
  muted: "#A7BED4"
typography:
  display-xl:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(4rem, 12vw, 9.5rem)"
    fontWeight: 800
    lineHeight: "0.9"
    letterSpacing: "-0.06em"
  h1:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(3rem, 7vw, 6rem)"
    fontWeight: 800
    lineHeight: "0.95"
    letterSpacing: "-0.05em"
  h2:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3.5rem)"
    fontWeight: 750
    lineHeight: "1.02"
    letterSpacing: "-0.04em"
  h3:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 750
    lineHeight: "1.15"
    letterSpacing: "-0.02em"
  body-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: "1.6"
  body-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.55"
  label-caps:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 800
    lineHeight: "1"
    letterSpacing: "0.12em"
rounded:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.pill}"
    padding: "14px 22px"
  button-secondary:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.pill}"
    padding: "14px 22px"
  card-glass:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.lg}"
    padding: "24px"
  metric-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.accent}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
---

## Overview

Fish is an Ocean Navy-built product concept that turns Ocean Network compute into simple AI services. The visual identity should feel like a premium community-born product: nautical, adventurous, technical, and trustworthy.

The current hero direction uses a geometric dolphin captain, a Venice-at-night canal world, and a fish-to-food metaphor. This is intentionally playful, but the UI must remain serious enough for OCEAN holders, providers, and developers.

Strategic visual thesis: Fish is a Venice fork with an Ocean Navy skin. The site should borrow the Venice feeling of canals, night markets, warm lantern reflections, and cinematic harbor scenes, then layer in Ocean Navy symbols, compute-dot motifs, OCEAN utility, and a clearer AI product flow.

Experience model: the public V0 should feel like entering a Venice fish market. Different visitors should get different entrances and lightweight interfaces:

- **Users** enter through the chat counter.
- **Builders** enter through the API hatch.
- **Providers** enter through the dock master.
- **OCEAN holders** enter through the vault door.

The product should never look like a cheap meme coin page. It should look like a real AI product with a memorable mascot.

Do not directly copy protected Venice or Ocean Protocol logos, typography, or exact UI layouts unless the team confirms usage rights. Use them as inspiration for mood, composition, and metaphor, while keeping Fish visually distinct.

Core feeling:

- **Ocean-native**: deep navy, aqua, data dots, waves, compute grids.
- **Ocean Navy**: captain, maps, docks, rope, lanterns, ships, expedition energy.
- **Venice wink**: canal bridges, gondolas, pescheria market hints, warm reflection lights.
- **AI product**: dashboards, API cards, metrics, receipts, provider status.

## Source Image Direction

Preferred generation source for future bitmap brand explorations: **GPT Image 2.0**, when available. Use these images as visual direction and mood references before converting the language into UI/UX components:

- `public/assets/fish-ocean-navy-venice.png`: primary all-in-one one-pager reference. Strong Ocean Navy/Venice direction, useful for launch mood and hero atmosphere.
- `public/assets/visual-identity/fish-ocean-protocol-captain.png`: captain-at-harbor variant with clearer Ocean Protocol co-branding. Useful as a reference for mascot pose, night harbor lighting, and flow-card illustration style.
- `public/assets/visual-identity/fish-venice-market-dolphin.png`: Venice fish-market variant with a friendlier dolphin and cleaner bottom benefit strip. Useful as a reference for the AI-as-food metaphor and softer mascot expression.

These source images include baked-in text and should not be treated as production UI screenshots. For product UI, extract the style, composition, color, mascot posture, and scene motifs, then render text, buttons, forms, and dashboard elements as accessible HTML/CSS.

If the active image tool cannot select GPT Image 2.0 directly, do not silently treat a generated result as final brand direction. Use the available model for rough exploration only, then mark the asset for human review.

## Colors

The palette is dark, luminous, and oceanic.

- **Navy 950 / 900:** full-page backgrounds, hero backdrops, deep ocean scenes.
- **Primary (#EAF7FF):** headlines and high-contrast body text.
- **Cyan / Aqua:** active product utility, flow arrows, CTAs, dashboards, live states.
- **Gold:** Ocean Navy warmth, captain details, treasure / earned value, lantern light.
- **Coral:** rare accent for alerts or emotional highlights. Use sparingly.
- **Purple:** credit/token accents, OCEAN utility, secondary glow.

Do not use flat black backgrounds. Always use layered navy gradients with subtle blue, aqua, or star-like noise.

## Typography

Use a modern grotesk such as Inter or a close system equivalent. Headlines should be very large, tight, and confident. Body copy should be minimal and plain.

Wording must be simple:

- Good: “Users buy AI. Providers get paid. OCEAN gains utility.”
- Bad: “A composable dual-tokenized compute-credit primitive for decentralized inference.”

Avoid unnecessary punctuation in taglines. Avoid emoji in the product UI. Emojis can be used only in community posts.

## Layout

The landing page should use bold, poster-like sections:

1. Hero: Fish logo, headline, slogan, mascot, CTAs.
2. Five-step flow: Stake OCEAN → Catch FISH → Use AI → Providers get paid → Ocean grows.
3. Benefit strip: Users / OCEAN holders / Ocean / Providers.
4. Live dashboard: Ocean Network supply and usage proof.
5. Roadmap: product first, token utility later.
6. Join pilot: providers and users.

Spacing should be generous. Each section should have one clear job.

## Elevation & Depth

Use glass cards with subtle neon borders and soft inner gradients. Depth should feel like illuminated panels floating in a night harbor. Avoid heavy drop shadows that make the page look like a generic SaaS landing page.

Cards:

- background: `surface-glass`
- border: `1px solid rgba(18, 216, 255, 0.28)`
- glow on hover: cyan or aqua, very subtle

## Shapes

Use rounded cards, pill badges, and circular metric icons. The design language should echo bubbles, coins, portholes, tokens, and ocean data dots.

Use angular low-poly illustration for the mascot and large hero art, but keep UI components smooth and modern.

## Components

### Hero

Must include:

- Fish wordmark and geometric fish mark.
- “Turn Ocean Network compute into easy AI.”
- “The fish were there all along — let’s farm and eat.”
- Builder label: “Built by Ocean Navy on Ocean Protocol.”
- CTAs: “View dashboard” and “Join provider pilot.”

### Flow Cards

Five cards only:

1. Stake OCEAN
2. Catch FISH
3. Use AI
4. Providers get paid
5. Ocean grows

Do not add subparagraphs inside the cards. Use image + title + optional one micro-label only.

### Dashboard Cards

Metrics must be large and honest. Show live/fallback status clearly.

Recommended metrics:

- advertised GPU supply
- available GPU supply
- provider count
- H200 starting price
- Ocean-native jobs
- provider payouts
- OCEAN staked / bonded, once implemented

### Roadmap Cards

Show sequence, not promises:

- Market-making
- API prototype
- Provider pilot
- Proof dashboard
- OCEAN staking
- Provider bonds
- Credits/token later

## Do's and Don'ts

### Do

- Say “built on Ocean Protocol,” not “official Ocean Protocol product,” unless officially approved.
- Keep the Fish metaphor simple and consistent.
- Make OCEAN utility concrete: staking, provider bonds, credits, buy/lock/burn potential.
- Show usage and provider payouts before token mechanics.
- Label live vs sample data clearly.

### Don't

- Do not imply guaranteed yield.
- Do not imply providers are paid by staking alone.
- Do not make WATER/FISH token promises before real usage exists.
- Do not present the project as an official Ocean Protocol product unless authorized.
- Do not overload landing sections with technical language.
