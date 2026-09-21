# Verification record and acceptance checklist

Release: 1.0.0. Date: 19 September 2026.

## Completed

`npm run verify` passed in the build environment: import/entry checks, 43 Node tests and static asset build. The test suite covers dataset validation, zero baseline, known disruptions, 90-unit recovery, backlog conservation, 686 combined delay/recovery combinations, all eight assembly buffers, immutable evaluation, strict dates, invalid numerical values, duplicate IDs, invalid relationships, scenarios/URLs/imports, storage failure, scoped guided answers, HTML/CSV escaping, all six views, valid source references and HTTP serving/security.

The application was built locally; no GitHub repository or Vercel deployment was created. Node 22 is the specified deployment/CI target; this environment executed verification using Node 24.19.0. CI provides the target-version check.

## Browser suite — included, not executed successfully here

Chromium was unavailable in this environment, and a download attempt could not complete. Therefore no desktop/mobile screenshot or interaction pass is claimed. GitHub CI installs Playwright 1.62.1 and Chromium, builds the application and executes `tests/browser.mjs`. Screenshots are uploaded as the `browser-results` artifact.

The suite exercises default KPIs, draft recovery preview, apply, saved scenario reload, JSON export, order search/detail, guided recovery answer, evidence search, network selection, 390 px overflow and page reload. Review its output and screenshots before presenting a tested deployment.

## Manual acceptance on the deployed URL

- At desktop and mobile widths, verify readable text, usable navigation, charts, tables, dialogs and no page-wide horizontal overflow.
- Tab through navigation and controls; verify visible focus, dialog focus containment, Escape dismissal and focus return. Test a screen reader; no formal accessibility conformance is claimed yet.
- Confirm the default four-day example, zero-delay baseline and 90-unit recovery example match README totals.
- Change multiple supplier delays; preview before applying and verify that uncommitted changes do not alter active order results.
- Open cited records and verify the allocation/evidence context.
- Save, reload, delete, export and import a scenario. Reject malformed JSON, wrong dataset/version and oversized files without losing active work.
- Copy a hosted scenario link into another browser; verify assumptions reproduce. Saved scenarios and activity should remain local to each browser.
- Test clipboard denial and browser storage denial; check visible guidance and continued computation.
- Export CSV and inspect order/amount fields in your spreadsheet application.
- Inspect the browser console/network for errors and confirm deployment headers. Check the GitHub browser job is green independently of Vercel's build.

These checks establish prototype behavior; they do not establish enterprise readiness, real-data accuracy, security certification or operational service levels.
