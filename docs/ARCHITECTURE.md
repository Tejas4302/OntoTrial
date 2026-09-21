# Architecture and live-integration boundary

## Current implementation

The app is a static ES-module client. `app.js` loads and validates the synthetic dataset, restores guarded local state, evaluates a scenario through a pure domain engine, and renders the active view. Hash routes work on static hosting without rewrite rules. The build copies only `public/` and `src/` into `dist/` and writes an asset checksum manifest.

`validation.js` is the source-data boundary. `engine.js` allocates inventory and shipment quantities and returns per-order allocations, source IDs, risk and totals. `scenario.js` serializes validated assumptions for URLs and JSON files. `assistant.js` answers a restricted set of intents from the same evaluated results. No LLM or SQL engine runs in the browser.

Amounts use integer paise. Dates use strict UTC calendar dates. Saved scenario imports are limited to 25 KB and tied to a dataset/version. Browser storage is treated as untrusted: malformed values are ignored or reported, and quota failures do not crash the app. There are at most 20 saved scenarios and 50 local activity entries. Storage can be cleared or modified by the user and must never serve as an audit system.

## Allocation contract

1. Validate records, IDs, references and assumptions.
2. Move supplier shipment dates by their independent 0–14 day delays.
3. Group by component; process orders by due date then ID.
4. Calculate material deadline as due date minus the 0–7 day assembly buffer.
5. Consume regular supply available by that deadline.
6. If enabled, consume alternate supply available by that deadline, only for the remaining shortage.
7. Reserve future regular supply for remaining backlog, preserving inventory conservation.
8. Mark any deadline shortage as at risk, even if future completion is possible.

This is an explainable heuristic, not a general optimizer. It excludes multi-component assemblies, labor/machine capacity, yield, transit uncertainty, substitute qualification, cancellations and split-delivery commercial rules. High-priority labels do not alter allocation ordering. Never add an optimizer claim without implementing and validating its objective and constraints.

## Proposed live architecture — not implemented

Keep credentials and real source records behind an authenticated backend. The client should request authorized data and scenario results from same-origin APIs. That backend should own identity, tenant checks, scenario validation, calculation versioning, persistence, rate limits and audit records. Never put Snowflake keys, access tokens or database credentials in browser JavaScript or committed environment files.

Suggested API responsibilities:

| Endpoint responsibility | Required behavior |
| --- | --- |
| Dataset snapshot | Authorized tenant scope, freshness timestamp, version and source lineage. |
| Scenario evaluation | Validate assumptions, run a versioned engine against an immutable snapshot, return record citations. |
| Scenario persistence | Server-owned IDs, ownership checks, optimistic concurrency and immutable change history. |
| Guided/AI question | Enforce source authorization, cite verified records, preserve scenario context and refuse unsupported answers. |
| Recovery approval | Explicit human approval and a separate, audited procurement action; never automatic from a chat suggestion. |

A Snowflake adapter can map validated supplier, component, shipment and order records into this contract. Cortex Analyst can support governed questions against semantic views, and document retrieval can support text evidence. These services are future integration work; this archive does not claim they have been configured or tested. Cortex Code is a development tool, not the running application backend.

## Production acceptance requirements

Before replacing the public synthetic dataset: implement and test authentication/authorization, tenant isolation, fresh source ingestion, retry and error contracts, durable audit, shared persistence, retention, monitoring, alerting and backups. Load-test representative data sizes and browser rendering. Conduct security review and keyboard/screen-reader/mobile testing. Define operational ownership and rollback. Decide business rules for missing/late data, allocation priorities and approval authority with the actual planning team.

The current strict CSP intentionally allows only same-origin connections. A backend integration must explicitly review its network destinations and headers instead of broadly disabling CSP. Hosting on Vercel does not itself supply user authentication or a database.
