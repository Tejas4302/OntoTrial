# OntoTrail

OntoTrail is a governed supply-chain intelligence workspace for the Hack2Skill Snowflake CoCo challenge. The current prototype is framed around the fictional client **Nova Mobility India** and combines:

- synthetic Nova Mobility supplier, material, PO, shipment and inventory records;
- Oxford Economics TradePrism bilateral trade intelligence;
- Pelmorex Weather Source: Frostbyte;
- Snowflake Cortex Analyst over governed semantic views;
- a Decision Board and scenario workspace for turning evidence into action.

The core demo flow is:

```text
External signal -> internal exposure -> AI reasoning -> scenario -> decision
```

## Current Snowflake architecture

```text
Authenticated browser
  -> /api/analyst
  -> governed domain routing
  -> Snowflake Cortex Analyst
       -> ONTOTRAIL_TRADE_RISK_ANALYST
       -> ONTOTRAIL_NOVA_MOBILITY_ANALYST
  -> read-only generated SQL
  -> Snowflake SQL API
  -> governed rows
  -> server-side answer synthesis
       -> Gemini API when GEMINI_API_KEY is configured
       -> Snowflake-only fallback otherwise
  -> direct business answer
```

The browser never receives the Snowflake Programmatic Access Token.

## Data boundary

Nova Mobility India is a fictional hackathon client. The internal `NOVA_*` operational records are synthetic.

TradePrism and Pelmorex are external Snowflake Marketplace sources. They provide contextual trade and weather intelligence and must not be presented as Nova Mobility proprietary transaction data.

Shared country, HS4 or commodity keys indicate contextual overlap only. They do not prove causation or a confirmed disruption.

## Required Snowflake setup

Marketplace products expected in the current account:

- `TRADEPRISM_FULL_DATASET.PUBLIC.TRADEPRISM_DATA`
- `PELMOREX_WEATHER_SOURCE_FROSTBYTE.ONPOINT_ID.FORECAST_DAY`

Run the current setup in this order:

```text
snowflake/00_marketplace_trade_weather_enrichment.sql
snowflake/02_marketplace_trade_weather_semantic_view.sql
snowflake/03_nova_mobility_internal_operations.sql
snowflake/04_nova_mobility_semantic_view.sql
```

This produces the two semantic views used by the application:

- `ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST`
- `ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST`

`snowflake/01_coco_cli_demo_dataset.sql` is an optional legacy/demo asset and is not required for the current Nova Mobility + Marketplace application path.

## Required Vercel environment variables

Snowflake:

```text
SNOWFLAKE_PAT
SNOWFLAKE_ACCOUNT_URL
SNOWFLAKE_WAREHOUSE
SNOWFLAKE_SEMANTIC_VIEW
SNOWFLAKE_NOVA_SEMANTIC_VIEW
```

Recommended current values:

```text
SNOWFLAKE_WAREHOUSE=ONTOTRAIL_WH
SNOWFLAKE_SEMANTIC_VIEW=ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_TRADE_RISK_ANALYST
SNOWFLAKE_NOVA_SEMANTIC_VIEW=ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_NOVA_MOBILITY_ANALYST
```

Optional external answer synthesis:

```text
GEMINI_API_KEY
GEMINI_MODEL=gemini-3.8-flash
```

`GEMINI_API_KEY` is used only by the server-side final-answer layer. Gemini receives the user question plus governed Snowflake result rows; it does not receive the Snowflake PAT and it has no database access. If the key is absent or the request fails, OntoTrail falls back to its Snowflake-only response path.

Authentication:

```text
ONTOTRAIL_AUTH_SECRET
ONTOTRAIL_CLIENT_EMAIL
ONTOTRAIL_CLIENT_PASSWORD
ONTOTRAIL_CLIENT_ADMIN_EMAIL
ONTOTRAIL_CLIENT_ADMIN_PASSWORD
ONTOTRAIL_ADMIN_EMAIL
ONTOTRAIL_ADMIN_PASSWORD
```

Optional decision email delivery:

```text
RESEND_API_KEY
DECISION_EMAIL_FROM
```

Secrets must remain in Vercel environment variables and must never be committed.

## Run locally

Requires Node.js 22.

```bash
npm ci --ignore-scripts
npm run dev
```

Run source verification, tests and a production build with:

```bash
npm run verify
```

The verification step checks browser code, serverless API code, authentication utilities, scripts and tests for syntax/import integrity before building `dist/`.

## Key capabilities

| Area | Capability |
| --- | --- |
| AI Analyst | Natural-language analysis grounded in governed Snowflake semantic views |
| Control tower | India import exposure plus Nova Mobility operational risk |
| Nova operations | Supplier, PO, material, shipment, plant and inventory views |
| Marketplace intel | TradePrism transport/exposure and Pelmorex weather context |
| Scenario lab | Deterministic structural stress testing |
| Decision Board | Convert grounded findings into tracked proposed actions |
| Metric governance | Canonical metric definitions and question-routing guardrails |
| Security | Server-side Snowflake PAT and signed HttpOnly workspace session |

## Recommended demo questions

Trade / Marketplace:

- `Which India imports are most dependent on sea transport in 2026?`
- `Among countries with weather coverage, which have the highest import exposure and weather risk?`
- `Explain Rest of World import exposure in 2026 including commodity concentration and weather coverage.`

Nova Mobility:

- `Which suppliers currently have the lowest inventory coverage for Nova Mobility?`
- `Why is Siam Thermal Solutions a supply-chain risk for Nova Mobility, and which purchase orders, materials and inventory positions need attention?`
- `How could the current external weather and TradePrism transport context affect Nova Mobility exposure to Aichi Drive Technologies?`

Follow-up:

- `What does this mean for Nova?`
- `What action should we take?`

## Repository structure

```text
api/                 Server-side auth, Cortex Analyst bridge and dashboard APIs
lib/                 Session signing utilities
public/              HTML shell, styles and static assets
src/domain/           Deterministic scenario logic
src/services/         Browser API clients and persistence
src/ui/               UI rendering and formatting
snowflake/            Marketplace enrichment, operational data and semantic views
scripts/              Build, verification and local development
tests/                Domain, routing, view and HTTP tests
docs/                 Architecture, testing and evaluation notes
vercel.json           Deployment and security configuration
```

## Security notes

- Snowflake credentials remain server-side.
- Gemini credentials remain server-side.
- External synthesis receives only governed result rows and conversation context, never the Snowflake PAT or direct database access.
- `/api/analyst`, `/api/trade-dashboard`, tenant admin APIs and decision notifications require a valid signed workspace session.
- Generated SQL is accepted only when it is read-only `SELECT`/`WITH` SQL.
- PAT access should use the least-privilege `ONTOTRAIL_APP_ROLE`.
- Production multi-tenant use would additionally require durable identity, row/tenant authorization in the data layer, persistent audit storage, rate limits and production-grade observability.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Evaluation notes](docs/EVALUATION.md)
