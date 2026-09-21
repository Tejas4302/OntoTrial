# OntoTrail demo evaluation and release notes

Reviewed input: `OntoTrail-Demo-2.html`. Review date: 19 September 2026.

## Assessment

The uploaded file is a useful hackathon proof of concept: it connects supply records to customer orders, supports independent supplier delays, has evidence drill-downs, scenario links and a readable business story. Its embedded data and deterministic calculations are appropriate for demonstration. It is not a production application: the original file combines presentation and business rules, has limited validation, uses temporary state and lacks deployment or regression-test infrastructure.

## Findings and changes

| Finding in uploaded demo | Why it matters | Change in this release |
| --- | --- | --- |
| “Reset to baseline” restores the four-day Aruna example. | Users can mistake a disruption for an undisturbed baseline. | True zero-delay baseline is distinct from the example scenario. |
| Recovery consumes 120 alternate units even when later orders have timely regular supply. | ₹1.08 lakh premium overstates the required recovery purchase. | Allocate timely regular supply first; the example uses 90 alternate units at ₹900, or ₹81,000. |
| Late orders do not consistently reserve future supply. | Later orders can appear covered by supply needed for backlog. | Outstanding demand reserves future regular stock before later orders. |
| Validation misses nonfinite/fractional numbers, impossible dates, duplicate records and some relationships. | Broken source records can silently corrupt the calculations. | Strict dataset and scenario validation runs before computation/rendering and during build. |
| All logic, styles and markup sit in one HTML file. | Changes are hard to isolate and regression-test. | Separate domain, storage, UI, controller and build modules. |
| Small dense UI and limited task separation. | Users need to decipher the screen before making decisions. | Six purpose-specific views, readable metrics, responsive navigation, search and empty states. |
| Activity is a short in-memory list described as audit. | Refresh loses history; it is not an accountable enterprise record. | Explicitly local activity, capped at 50 entries; no claim of durable audit. |
| File URLs and optimistic clipboard fallback can mislead sharing. | A copied local path cannot reproduce a demo on another machine. | Hosted scenario URLs, versioned JSON exports and visible clipboard failure handling. |
| No repeatable build, security policy or regression suite. | Deployment and edits are fragile. | Vercel configuration, strict CSP, build checks, 43 automated tests and browser CI. |

## Numerical regression example

| Assumptions | Orders at risk | Order-value exposure | Recovery units | Premium |
| --- | ---: | ---: | ---: | ---: |
| All delays zero; buffer 2 days | 0 | ₹0 | 0 | ₹0 |
| Aruna +4 days; buffer 2 days | 2 | ₹10,40,000 | 0 | ₹0 |
| Same disruption; alternate recovery enabled | 1 | ₹4,55,000 | 90 | ₹81,000 |

ORD-1002 remains late because its material deadline precedes alternate-stock arrival. ORD-1003 receives timely alternate stock. ORD-1004 can use regular supply and does not require an unnecessary premium purchase. Exposure measures affected order value, not proven commercial loss.

## Delivered quality measures

- Explicit preview/apply flow prevents accidental scenario changes.
- Validated versioned scenario import/export, saved scenarios and reproducible links.
- Searchable orders/documents and source-cited calculations.
- Escaped dynamic HTML and CSV spreadsheet-formula neutralization.
- No runtime dependencies, CDN fonts, trackers or embedded credentials.
- Restricted local file serving and Vercel response security headers.
- Keyboard-oriented controls, labeled dialogs, skip navigation and reduced-motion styling are implemented; browser/accessibility acceptance remains pending.

A path traversal defect found in the new local server during testing was corrected by constraining source requests to the actual `src/` directory, including real-path containment. Its regression test now passes.

## Verification status

`npm run verify` passed: source checks, **43 automated tests**, static build. The engine was checked against **686 combined disruption scenarios**. HTTP tests include blocked private paths, encoded traversal, method handling and security headers.

Real-browser acceptance was **not completed** in this environment because Chromium was unavailable. A runnable Playwright suite and GitHub Actions workflow are included. Responsive CSS and markup tests are not substitutes for visual or accessibility verification. No live Vercel deployment, load test, penetration test or Snowflake execution was performed.

## Before real operational use

The application currently uses synthetic public data and local browser storage. Live production requires authenticated server APIs, tenant isolation, role-based permissions, authoritative source ingestion, transactional scenario storage, durable audit events, observability, backups and operational ownership. Procurement actions must remain separate from planning suggestions and require an explicit approval process. See `ARCHITECTURE.md` for the proposed integration boundary.
