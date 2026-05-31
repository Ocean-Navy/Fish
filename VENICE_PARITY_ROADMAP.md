# Venice-Style Feature Parity Roadmap

Fish should not clone only the token mechanics. The valuable part is the complete product loop:

```text
App + API + billing + privacy + model routing + credits + staking + provider settlement
```

## Feature groups to build step by step

### Group 1 — App and API

- Chat UI.
- Model selector.
- Local conversation storage option.
- API keys.
- OpenAI-compatible chat endpoint.
- Usage dashboard.
- Credits balance.

### Group 2 — Billing and credits

- Internal Fish Credits ledger.
- Credit grants.
- Pay-as-you-go top-ups.
- Subscription plans.
- Usage receipts.
- Billing order:

```text
Fish Credits → subscription credits → prepaid balance → external payment
```

### Group 3 — Model routing

- Ocean-native providers.
- External fallback providers.
- Provider preference rules.
- Privacy mode selection.
- Cost-aware routing.
- Failover.

### Group 4 — Privacy modes

Start honest and staged:

1. `External` — routed to external APIs where provider policies apply.
2. `Ocean private policy` — selected no-log Ocean providers.
3. `Ocean hardened` — approved containers, redacted logs, restricted telemetry.
4. `TEE` — attested provider environments, later.
5. `E2EE-to-TEE` — strongest privacy, much later.

Do not call V1 “cryptographically private” unless TEE/E2EE exists.

### Group 5 — OCEAN staking

- Stake OCEAN.
- Earn credits from a funded budget.
- Longer locks can earn higher credit rate.
- Dashboard shows OCEAN locked.
- Credits are spendable in API.

### Group 6 — Credit minting / debt

Later:

```text
Lock OCEAN → mint credits → spend/allocate credits → repay/burn credits to unlock OCEAN
```

This is the strongest Venice-like mechanic, but only after credit budgets and provider settlement are safe.

### Group 7 — Provider bonds

- Providers bond OCEAN.
- Bond increases routing eligibility.
- Performance score matters more than bond alone.
- Slash only after dispute system is mature.

### Group 8 — Capacity pool

Later AntSeed-like layer:

```text
OCEAN holders earn credits
→ allocate unused credits to capacity pool
→ external users buy AI
→ providers get paid
→ pool accounting updates
```

Direct USDC distributions to credit suppliers need legal review.

### Group 9 — Tokenized credits

Do not start here.

When ready:

- define whether FISH/WATER is a transferable token or restricted credit;
- audit contracts;
- cap outstanding liabilities;
- publish reserves and settlement coverage;
- avoid guaranteed yield language.

## Sequence

1. Fish landing + dashboard.
2. API prototype.
3. Credits ledger.
4. Provider pilot.
5. Proof dashboard.
6. Staking.
7. Provider bonds.
8. Capacity pool.
9. Tokenized credits.
10. Full privacy modes.

