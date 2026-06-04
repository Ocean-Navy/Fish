# Product Specification: Fish

## One-line product definition

Fish turns Ocean Network compute into easy AI.

## Short pitch

Oncompute / Ocean Network gives Ocean a pay-per-use compute layer. Fish sits above that layer as a simple app and API. Users buy AI without dealing with raw nodes. Providers receive routed jobs and get paid. OCEAN gains utility through staking, credits, provider bonds, and potential buy/lock/burn support after real usage exists.

## Builder identity

- Product: **Fish**
- Team / community identity: **Ocean Navy**
- Infrastructure: **Built on Ocean Protocol / Ocean Network / Oncompute**
- Positioning: **Community-built product layer, not an official Ocean Protocol product unless later approved**

## Core slogan

> The fish were there all along — let’s farm and eat.

Use this slogan in hero copy, launch posts, and early community materials.

## Product principles

1. **Product first, token second.**
   The first job is to prove users want a simple AI product on top of Ocean Network compute.

2. **No raw marketplace for users.**
   Users should not choose providers, GPU environments, escrow, or job settings in the first product surface. Fish routes behind the scenes.

3. **Providers are paid from real money.**
   Staking does not magically pay providers. Providers are paid from user revenue, funded budgets, reserves, or settlement pools.

4. **Usage must be visible.**
   The dashboard must show real Ocean Network supply, jobs, usage, and payouts as early as possible.

5. **OCEAN utility must be measurable.**
   The website should track OCEAN staked, OCEAN bonded, credits earned, credits spent, and future buy/lock/burn metrics.

6. **Privacy claims must match the route.**
   Fish should show what processed an order and what is stored. Do not claim TEE, E2EE, zero retention, or "not even Fish can see it" until the route can prove that.

## Target audiences

### Everyday users

Need: simple AI access.

They want:

- one simple app;
- one API key;
- private/open AI options;
- clear pricing;
- no provider selection.

### Developers

Need: a reliable API.

They want:

- OpenAI-compatible endpoints;
- model list;
- usage and billing dashboard;
- streaming responses;
- embeddings and batch jobs;
- predictable pricing.

### OCEAN holders

Need: a reason to hold, stake, and lock OCEAN.

They want:

- OCEAN staking to earn AI credits;
- visible OCEAN utility;
- future provider-bond demand;
- credible value capture from real usage;
- no empty token promises.

### Compute providers

Need: routed demand and reliable payouts.

They want:

- jobs routed to them;
- clear provider rules;
- payouts in USDC/OCEAN first;
- optional OCEAN bonding later;
- dashboards showing performance and earnings.

### Ocean ecosystem

Need: broader reach and revenue potential.

Fish should help Ocean become easier to understand:

- Ocean Network = compute supply;
- Fish = AI demand packaging;
- OCEAN = coordination, staking, bonding, and value-capture asset.

## Initial scope

### V0: Landing + supply dashboard

- Public landing page.
- Ocean Network supply dashboard.
- Live/fallback ingestion from Oncompute/Ocean Network endpoints.
- Provider pilot signup.
- User waitlist.
- Roadmap.

### V1: One AI API prototype

- API keys.
- OpenAI-style `/v1/chat/completions`.
- OpenRouter or mock backend fallback for model coverage.
- Internal credits ledger.
- Usage receipts.

### V2: Ocean provider pilot

- Selected providers behind the gateway.
- Batch inference jobs first.
- Provider payout accounting.
- Public proof dashboard.

### V3: OCEAN staking credits

- Stake OCEAN.
- Earn Fish Credits / AI credits.
- Spend credits in API.
- Cap credit issuance by funded budget.

### V4: Provider bonding

- Providers bond OCEAN.
- Bond affects routing eligibility.
- Performance score + uptime.
- Conservative penalties before slashing.

### V5: Venice-style parity features

- Subscriptions.
- Daily AI credit allowance.
- Tokenized credits only after usage exists.
- Capacity pool.
- Privacy modes.
- More models and API tools.

## Non-goals for V0

- No transferable token.
- No guaranteed yield.
- No claims of official Ocean Protocol ownership.
- No promise that staking alone funds compute.
- No full Venice clone on day one.
- No raw user-facing compute marketplace.

## Key value loops

### User loop

```text
User visits Fish
→ buys AI or uses credits
→ Fish routes to providers
→ user receives simple AI output
```

### Provider loop

```text
Provider joins pilot
→ runs approved compute environment
→ Fish routes jobs
→ provider gets paid
→ provider can later bond OCEAN for more routing eligibility
```

### OCEAN holder loop

```text
Holder stakes OCEAN
→ earns AI credits from funded budget
→ spends credits or allocates them later
→ OCEAN is locked while utility grows
```

### Protocol value loop

```text
Users buy AI
→ providers get paid
→ Fish can earn margin
→ margin can fund reserves, staking credits, and future OCEAN buy/lock/burn
```

## Success metrics

### V0 metrics

- Website visits.
- Waitlist signups.
- Provider pilot signups.
- Ocean Network supply snapshots collected.
- Available GPU supply identified.
- Providers contacted.
- Benchmark targets selected.

### V1 metrics

- API keys created.
- AI requests served.
- Credits spent.
- Cost per request.
- Gross margin estimate.

### V2 metrics

- Ocean-native jobs completed.
- Provider payouts recorded.
- Provider uptime.
- Failure/refund rate.
- Cost per 1M tokens or per batch job.

### V3+ metrics

- OCEAN staked.
- OCEAN bonded by providers.
- Credits issued.
- Credits spent.
- Credits outstanding.
- Revenue allocated to reserves or OCEAN support.
