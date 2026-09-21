# Testing

Run the complete source verification, Node test suite and static build with:

```bash
npm run verify
```

The automated suite covers dataset validation, scenario evaluation, allocation invariants, import/URL validation, storage failures, HTML/CSV escaping, view rendering and local HTTP/security behavior.

For browser acceptance testing:

```bash
npm install --no-save --package-lock=false --ignore-scripts playwright@1.62.1
npx playwright install chromium
npm run test:browser
```

Before a public demo, verify the production deployment at desktop and mobile widths and run at least these Cortex Analyst checks:

1. `What is the total exposure in the ARUNA_4D scenario?`
2. `Which suppliers have the highest exposure in ARUNA_4D?`
3. `Compare total exposure between ARUNA_4D and ARUNA_4D_RECOVERY.`
4. `Which products have the highest exposure at Bengaluru Plant in ARUNA_4D?`

Confirm that results come from `ONTOTRAIL_COCO_ANALYST`, visualizations match the returned data and generated SQL remains read-only.
