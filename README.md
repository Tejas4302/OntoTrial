# OntoTrail

OntoTrail is a supply-chain intelligence workspace for tracing disruption impact across suppliers, products, plants, customers and orders. The CoCo CLI Hackathon workspace combines scenario analysis with Snowflake Cortex Analyst so authenticated users can ask business questions in natural language and inspect the grounded result, visualization, table and generated SQL.

**Client workspace:** CoCo CLI Hackathon  
**Dataset snapshot:** 18 September 2026  
**Access model:** Authenticated tenant workspace

## Client access

The deployed demo uses server-side authentication. Jury credentials are distributed privately and are not stored in this public repository or browser JavaScript.

Unauthenticated visitors can view only the public product landing page and login screen. Workspace routes redirect to login when no valid session is present, and the Snowflake analytics endpoint rejects unauthenticated requests.

## Key capabilities

| Area | Capability |
| --- | --- |
| Control tower | Exposure, coverage, supplier status and disruption KPIs |
| Supply network | Trace supplier, shipment, component and order relationships |
| Scenario lab | Compare baseline, disruption and recovery scenarios |
| Ask OntoTrail | Natural-language analytics grounded through Snowflake Cortex Analyst |
| Results | Direct business answer, dynamic visualization, filters and detailed table |
| Auditability | Generated SQL available as a collapsed audit trail |
| Access | Authenticated client session with explicit logout |

## Snowflake architecture

```text
Authenticated browser session
  -> /api/analyst
  -> Snowflake Cortex Analyst
  -> ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_COCO_ANALYST
  -> governed SQL
  -> Snowflake SQL API
  -> OntoTrail result UI
```

The browser never receives the Snowflake Programmatic Access Token. The server endpoint accepts Cortex-generated read-only queries and rejects non-read-only SQL before execution.

## Required Vercel environment variables

Snowflake:

```text
SNOWFLAKE_PAT
SNOWFLAKE_ACCOUNT_URL
SNOWFLAKE_SEMANTIC_VIEW
SNOWFLAKE_WAREHOUSE
```

Authentication:

```text
ONTOTRAIL_AUTH_SECRET
ONTOTRAIL_CLIENT_EMAIL
ONTOTRAIL_CLIENT_PASSWORD
ONTOTRAIL_ADMIN_EMAIL          # optional
ONTOTRAIL_ADMIN_PASSWORD       # optional
```

`ONTOTRAIL_AUTH_SECRET` should be a long random value and must never be committed. Client and administrator passwords must remain Vercel secrets.

## CoCo CLI data model

The Snowflake demo model contains 72 orders represented across three governed scenarios, producing 216 analytical rows. It spans 12 suppliers, 8 customers, 12 products and 4 plants.

The governed scenarios are:

- `BASELINE`
- `ARUNA_4D`
- `ARUNA_4D_RECOVERY`

Exposure represents order value at risk in the scenario; it is not claimed lost revenue. Scenario rows remain separate and must not be aggregated into a single grand total.

The Snowflake setup script is available at `snowflake/01_coco_cli_demo_dataset.sql`. It creates the client demo table and the separate `ONTOTRAIL_COCO_ANALYST` semantic view without replacing the original `ONTOTRAIL_ANALYST` view.

## Run locally

Requires Node.js 22.

```bash
npm ci --ignore-scripts
npm run dev
```

For full authenticated API testing, provide the same environment variables locally. Static/domain verification can be run with:

```bash
npm run verify
```

## Deploy to Vercel

1. Import this repository into Vercel.
2. Use Node.js 22.x.
3. Keep the build configuration from `vercel.json`.
4. Configure Snowflake and authentication environment variables in Vercel.
5. Deploy from the production branch.
6. Confirm that unauthenticated workspace URLs redirect to login.
7. Confirm login, logout and Cortex Analyst access before sharing the demo.

## Repository structure

```text
api/                 Server-side authentication and Cortex Analyst bridge
lib/                 Server-side session signing utilities
public/              HTML shell, styles and static assets
src/domain/           Scenario and allocation domain logic
src/services/         Cortex client and browser persistence
src/ui/               UI rendering and formatting
snowflake/            Demo dataset and semantic-view setup
scripts/              Build and local development utilities
tests/                Domain, view and HTTP tests
docs/                 Architecture, evaluation and testing notes
vercel.json           Deployment and security configuration
```

## Security

Snowflake credentials remain server-side. Authentication uses an HttpOnly, Secure, SameSite session cookie signed with `ONTOTRAIL_AUTH_SECRET`. `/api/analyst` requires a valid session before accessing Snowflake.

For a production multi-tenant deployment, tenant authorization should also be enforced in the data layer for every query, with least-privilege Snowflake roles, centralized identity, durable audit records and a production network/authentication strategy.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Evaluation notes](docs/EVALUATION.md)


## Role model

OntoTrail uses three demo roles:

- **OntoTrail Platform Admin** — manages client organizations and account metadata. Configure with `ONTOTRAIL_ADMIN_EMAIL` and `ONTOTRAIL_ADMIN_PASSWORD`.
- **Client Admin** — manages users inside the CoCo CLI Hackathon tenant and can use the client workspace. Configure with `ONTOTRAIL_CLIENT_ADMIN_EMAIL` and `ONTOTRAIL_CLIENT_ADMIN_PASSWORD`.
- **Client User** — uses the CoCo CLI Hackathon planning and analytics workspace. Configure with `ONTOTRAIL_CLIENT_EMAIL` and `ONTOTRAIL_CLIENT_PASSWORD`.

All credentials remain in Vercel environment variables. Do not commit passwords or tokens to the repository.

## Decision email notifications

Decision Board email delivery uses Resend through the server-side `/api/decision-notify` function. Add these Vercel environment variables for Production:

- `RESEND_API_KEY` - Resend API key (Secret)
- `DECISION_EMAIL_FROM` - verified sender, for example `OntoTrail <decisions@yourdomain.com>`

If email delivery is not configured, decisions and status history still work; the UI marks the notification as pending configuration. No email credentials are stored in the browser or repository.
