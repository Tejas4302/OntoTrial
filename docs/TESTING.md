# Testing

Run the complete verification pipeline with:

```bash
npm run verify
```

This performs:

1. JavaScript syntax/import checks across `src/`, `api/`, `lib/`, `scripts/` and `tests/`.
2. Node test suite execution.
3. A clean production build into `dist/`.

For browser acceptance testing:

```bash
npm install --no-save --package-lock=false --ignore-scripts playwright@1.62.1
npx playwright install chromium
npm run test:browser
```

## Production smoke tests

Trade / Marketplace:

1. `Which India imports are most dependent on sea transport in 2026?`
2. `Among countries with weather coverage, which have the highest import exposure and weather risk?`
3. `Explain Rest of World import exposure in 2026 including commodity concentration and weather coverage.`

Nova Mobility:

4. `Which suppliers currently have the lowest inventory coverage for Nova Mobility?`
5. `Why is Siam Thermal Solutions a supply-chain risk for Nova Mobility, and which purchase orders, materials and inventory positions need attention?`
6. `How could the current external weather and TradePrism transport context affect Nova Mobility exposure to Aichi Drive Technologies?`

Conversation:

7. Follow a trade/weather answer with `What does this mean for Nova?`
8. Follow a Nova operational answer with `What action should we take?`

## Acceptance criteria

- Trade questions resolve to `ONTOTRAIL_TRADE_RISK_ANALYST`.
- Nova operational questions resolve to `ONTOTRAIL_NOVA_MOBILITY_ANALYST`.
- The UI shows a direct business answer, not a query interpretation such as “This is our interpretation of your question”.
- Generated SQL remains read-only.
- Follow-up context is retained.
- No Marketplace signal is described as a confirmed Nova disruption without supporting Nova operational evidence.
- Countries without Pelmorex coverage remain explicitly uncovered.
- Logout/login does not expose Snowflake credentials.
