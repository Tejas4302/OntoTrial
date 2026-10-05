# Evaluation guide

OntoTrail should be evaluated as a governed supply-chain intelligence and decision-support prototype.

## What to inspect

- Natural-language questions are grounded through Snowflake semantic views rather than unrestricted free text.
- Analytical responses give a direct business answer and retain generated SQL/result evidence for auditability.
- The system distinguishes external Marketplace context from synthetic Nova Mobility operational evidence.
- Cross-domain mappings use governed keys and do not claim causation.
- Scenario analysis is separate from live Marketplace/Nova semantic analytics.
- Snowflake credentials remain server-side.

## Suggested walkthrough

1. Open Control Tower and identify a Nova operational exposure.
2. Ask the AI Analyst a Marketplace question such as:
   `Among countries with weather coverage, which have the highest import exposure and weather risk?`
3. Follow with:
   `What does this mean for Nova?`
4. Inspect the Nova operational evidence and generated SQL.
5. Convert the grounded result into a proposed decision.
6. Open the Decision Board and inspect the action, owner, due date and status.

## Challenge-alignment checks

- Ask the same business concept with different wording and confirm it resolves to the same governed metric.
- Test trade exposure, transport dependency, weather coverage, supplier risk, inventory health and PO exposure.
- Expand generated SQL to verify grounding against the intended semantic view.
- Confirm TradePrism/Pelmorex data is described as external context.
- Confirm Nova operational records are described as synthetic hackathon data.

## Scope

The prototype does not claim that a shared country, commodity or HS4 mapping proves a supplier disruption. Exposure and weather context are decision-support signals only unless internal Nova evidence confirms an operational issue.

The Decision Board and chat history use prototype browser persistence rather than a shared enterprise database.
