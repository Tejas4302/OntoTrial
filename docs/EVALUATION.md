# Evaluation guide

OntoTrail should be evaluated as a traceable supply-chain analytics and scenario-planning demonstration.

## What to inspect

- Natural-language questions are grounded through a Snowflake semantic view rather than answered from unrestricted free text.
- Analytical responses provide a direct business answer followed by the supporting result set and visualization.
- Generated SQL remains available for inspection.
- Scenario analysis distinguishes baseline, disruption and recovery rather than combining alternative scenarios.
- The demo tenant uses synthetic records and does not expose customer data.
- Snowflake credentials remain on the server side.

## Suggested walkthrough

Start with the control tower, inspect a disruption, open the scenario lab, then use Ask OntoTrail to compare `ARUNA_4D` with `ARUNA_4D_RECOVERY`. Follow with a supplier or product ranking question and inspect the generated SQL audit trail.

## Scope

Exposure is order value at risk, not forecast lost revenue. The deterministic scenario engine is an explainable planning heuristic. The public login is a demonstration identity, not production authentication.


## Challenge-alignment checks

1. Ask the same exposure question using the Planning, Procurement and Logistics prompts in **Metric governance** and verify that all resolve to the same canonical exposure definition.
2. Test canonical KPI questions for on-time delivery rate, fill rate, days of inventory and landed cost.
3. Expand the generated SQL audit trail to confirm the result is grounded in `ONTOTRAIL_COCO_ANALYST`.
