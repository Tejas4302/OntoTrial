# OntoTrail architecture

## Application layers

OntoTrail separates the browser experience, deterministic scenario logic and live analytical integration.

The browser application renders the control tower, supply network, scenario lab, evidence views and Ask OntoTrail. Local scenario state is validated before use and browser storage is treated as untrusted.

The scenario engine evaluates the bundled synthetic planning dataset with deterministic allocation rules. This makes scenario demonstrations reproducible and keeps operational calculations separate from conversational analytics.

## Cortex Analyst integration

Ask OntoTrail calls the same-origin `POST /api/analyst` endpoint. The Vercel server-side function reads Snowflake configuration from environment variables, sends the user question to Cortex Analyst against the configured semantic view, validates generated SQL as read-only and executes it through Snowflake's SQL API. The browser receives only the analytical response and result data.

```text
OntoTrail browser
      |
      v
Vercel /api/analyst
      |
      +--> Cortex Analyst
      |      |
      |      v
      |  ONTOTRAIL_COCO_ANALYST
      |      |
      |      v
      +--> generated read-only SQL
             |
             v
        Snowflake SQL API
             |
             v
      result + audit metadata
```

The Snowflake PAT is never embedded in browser JavaScript. Public demo credentials are separate from Snowflake authentication.

## Semantic layer

`ONTOTRAIL.SUPPLY_CHAIN.ONTOTRAIL_COCO_ANALYST` models the synthetic CoCo CLI Hackathon tenant. It exposes scenario, customer, supplier, product, plant, order, status and date dimensions together with exposure, order value, quantity, delay and order-count metrics.

Scenario governance keeps `BASELINE`, `ARUNA_4D` and `ARUNA_4D_RECOVERY` separate. If a question does not identify a scenario, the semantic instructions default analytical questions to `ARUNA_4D` and include the scenario in the output.

## Security boundary

The public client account is intentionally non-privileged and exists only for the synthetic demonstration. Infrastructure secrets belong in Vercel environment variables. Production use requires server-side identity, tenant authorization, least-privilege Snowflake roles, durable audit, monitoring, rate limits and an appropriate Snowflake network/authentication policy.

## Scenario engine boundary

The bundled deterministic engine is an explainable planning heuristic rather than a general optimizer. It models supplier delays, inventory timing, alternate recovery and order exposure for the demonstration dataset. It does not claim to model every production constraint such as labor capacity, multi-level BOMs, yield uncertainty or commercial split-delivery rules.
