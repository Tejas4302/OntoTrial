# OntoTrail architecture

## Application layers

OntoTrail separates the browser experience, deterministic scenario engine and live Snowflake analytical integration.

The browser renders the AI Analyst, Control Tower, Nova operations, Marketplace intelligence, Trade network, Scenario lab, Decision Board and governance views. Browser storage is treated as untrusted and validated before use.

The deterministic scenario engine is a separate planning aid. It does not replace the governed Snowflake operational/trade views used by the AI Analyst.

## Cortex Analyst integration

`POST /api/analyst` is the server-side analytics bridge.

```text
OntoTrail browser
      |
      v
Vercel /api/analyst
      |
      +--> governed routing / follow-up context
      |
      +--> Cortex Analyst
      |      |
      |      +--> ONTOTRAIL_TRADE_RISK_ANALYST
      |      |
      |      +--> ONTOTRAIL_NOVA_MOBILITY_ANALYST
      |
      +--> generated read-only SQL
             |
             v
        Snowflake SQL API
             |
             v
      governed rows + audit metadata
             |
             v
      server-side answer synthesis
        |-- Gemini API when configured
        \-- Snowflake-only fallback
             |
             v
      direct business answer
```

The Snowflake PAT is never embedded in browser JavaScript.

## Final-answer synthesis boundary

Cortex Analyst remains the governed query engine. It selects the semantic view, produces governed SQL and returns Snowflake evidence. When `GEMINI_API_KEY` is configured, OntoTrail sends only the current question, limited conversation context and compact governed result rows to the Gemini API for prose synthesis.

The external model has no Snowflake credentials and no database access. It is instructed to use only supplied evidence, distinguish synthetic Nova operational evidence from TradePrism/Pelmorex context, avoid unsupported causation and avoid recommendations unless justified by internal evidence.

If external synthesis is unavailable, the API falls back to Snowflake-based final-answer generation.

## Semantic domains

### India trade risk

`ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST`

Covers annual India bilateral trade flows, import/export exposure, HS4/commodity hierarchy, transport-mode dependency, weather coverage and weather-linked external risk.

TradePrism rows are annual bilateral flows/forecasts, not shipments or purchase orders.

### Nova Mobility operations

`ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST`

Covers the fictional Nova Mobility India supplier, PO, material, shipment, plant, inventory and operational-risk model.

Nova operational rows are synthetic. Marketplace enrichment is external context.

## Cross-domain governance

Allowed contextual mappings are:

- `HS4_CODE <-> HS4_CODE`
- `COMMODITY_GROUP <-> COMMODITY_GROUP`
- `ORIGIN_COUNTRY <-> ORIGIN_COUNTRY`

A shared key means potential relevance, not causation and not proof of disruption.

## Marketplace enrichment

The reproducible source layer is created by:

`snowflake/00_marketplace_trade_weather_enrichment.sql`

It joins India-focused TradePrism flows to currently available Pelmorex country coverage and creates:

`ONTOTRAIL.SUPPLY_CHAIN.INDIA_TRADE_RISK_ENRICHED`

Countries without Pelmorex coverage remain visible and explicitly report weather as unavailable.

## Security boundary

Authentication uses an HttpOnly, Secure, SameSite session cookie signed with `ONTOTRAIL_AUTH_SECRET`.

Snowflake access uses a server-side Programmatic Access Token, ideally restricted to `ONTOTRAIL_APP_ROLE`. The application never sends the PAT to the browser.

Generated SQL is passed through a read-only validator before execution.

## Decision workflow

AI evidence can be converted into a proposed Decision Board item. The Decision Board stores prototype state in browser storage. Optional owner email delivery is handled by `/api/decision-notify` when Resend is configured.

## Prototype boundaries

- Nova Mobility India is fictional.
- Decision and chat persistence are prototype browser-storage features, not a shared enterprise database.
- The deterministic scenario engine is a demonstration heuristic, not a production optimizer.
- Production use would require durable identity, tenant authorization at the data layer, persistent audit storage, centralized observability and stronger operational controls.
