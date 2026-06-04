# Fish Visual Identity Assets

This repo contains generated bitmap references for Fish. They are direction-setting assets, not final UI files.

## Preferred Image Model

Future brand-image explorations should use GPT Image 2.0 when available. The user prefers GPT Image 2.0 for images that will later be converted into UI/UX.

If the current tooling cannot explicitly select GPT Image 2.0, generated images should be treated as rough exploration and reviewed before becoming production brand assets.

## Current Assets

| Asset | Source | Role |
| --- | --- | --- |
| `public/assets/fish-ocean-navy-venice.png` | `OceanFish_one_pager.png` | Primary one-pager and current hero-atmosphere reference. |
| `public/assets/visual-identity/fish-ocean-protocol-captain.png` | `ChatGPT Image May 31, 2026, 12_14_46 PM.png` | Ocean Protocol captain/harbor variant. Good for mascot pose, moonlit harbor palette, and flow-card illustration direction. |
| `public/assets/visual-identity/fish-venice-market-dolphin.png` | `OceanFish_one.png` | Venice market/dolphin variant. Good for softer mascot expression, market metaphor, and benefit-strip styling. |
| `public/assets/generated/fish-market-hero.png` | Built-in image generation from Venice/Ocean Navy context | Text-free hero background for the public homepage. |
| `public/assets/generated/fish-flow-stake.png` | Built-in image generation from Venice/Ocean Navy context | Dedicated flow art for staking/OCEAN holder entry. |
| `public/assets/generated/fish-flow-catch.png` | Built-in image generation from Venice/Ocean Navy context | Dedicated flow art for catching FISH. |
| `public/assets/generated/fish-flow-use.png` | Built-in image generation from Venice/Ocean Navy context | Dedicated flow art for users and AI usage. |
| `public/assets/generated/fish-flow-paid.png` | Built-in image generation from Venice/Ocean Navy context | Dedicated flow art for providers getting paid. |
| `public/assets/generated/fish-flow-grow.png` | Built-in image generation from Venice/Ocean Navy context | Dedicated flow art for Ocean growth. |
| `public/assets/generated/fish-role-builder.png` | Built-in image generation from Venice/Ocean Navy context | Dedicated role art for the builder/API hatch entrance. |

## Experience Model

The public V0 should feel like a Venice fish market, not a static poster. Visitors choose an entrance based on their role:

- Users: meal counter.
- Builders: API hatch.
- Providers: fishing boats.
- OCEAN holders: vault door.

Each entrance can expose a different lightweight interface while still feeding the same shared Fish loop.

## UI Conversion Rules

- Use the images for mood, composition, lighting, mascot treatment, and illustration style.
- Do not ship baked-in image text as the only source of important copy.
- Render headings, CTAs, forms, dashboard metrics, caveats, and disclaimers as accessible HTML.
- Keep the live UI honest: Fish is community-built by Ocean Navy, built on Ocean Protocol, and not presented as official unless approved.
- Keep the token/credit language conservative: product first, token utility after usage.
- Use generated imagery as background or illustration, with strong overlays where needed for text readability.

## Launch Recommendation

For the fastest public V0, use the generated text-free assets in production UI and keep the original poster-style images as references only. Continue rendering all production copy in HTML.
