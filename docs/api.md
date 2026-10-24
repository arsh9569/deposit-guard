# API

Base path: `/api`. The initial API exposes `GET /health`, returning `200` only when the API's MongoDB connection is ready and `503` otherwise. It discloses only service and connection state.

Planned versioned API and authorization conventions are documented in the [architecture blueprint](../../outputs/depositguard-architecture.md#6-api-endpoint-specifications). All request bodies will be validated with Zod. Authenticated identity, role, institution scope and workflow transitions must be derived or enforced server-side, never trusted from client-submitted fields.

## Implemented institution workflows

All routes below require an authenticated session and resolve institution membership on the server. The client must send the session cookie and CSRF token for state-changing requests.

- `GET /dashboard?institutionId=<id>` returns tenant-scoped counts, the maturity queue, configured maturity window, and recent audit activity. A `403` is an authorization denial; the client handles loading, empty, error, and denied responses.
- `GET|PUT /institutions/:institutionId/workflows/maturity/policy` reads or updates institution policy. Only institution administrators may edit it. Reminder lead days can be empty (disabled); no AICTE threshold is preconfigured. The dashboard window, delivery retry maximum/backoff, release evidence requirement, and replacement-completion requirement are configurable.
- `GET /institutions/:institutionId/workflows/maturity/cases` lists instruments whose UTC maturity date is before the current UTC calendar day. Equality with today's date is not overdue.
- `POST /institutions/:institutionId/workflows/maturity/run` generates deduplicated in-app reminders and overdue notifications, then retries due deliveries. The unique tenant/recipient/dedupe key prevents repeat generation. Delivery state and exponential retry scheduling are stored on each notification.
- `POST|GET /institutions/:institutionId/workflows/renewals` creates pending requests and lists history. `POST /renewals/:id/transition` applies validated transitions. Operators submit; official reviewers or administrators decide. Optional replacement instrument links are checked within the tenant and preserve source document history.
- `POST|GET /institutions/:institutionId/workflows/release-requests` creates/lists requests. Every POST requires an `Idempotency-Key` header containing 16–128 ASCII letters, digits, `.`, `_`, `:`, or `-`. A retry with the same key and payload replays the existing request; reusing a key with a changed payload returns `409`. `POST /release-requests/:id/transition` records scrutiny, an authorized decision, or separately evidenced completion. Completion records administrative evidence only; no financial transfer is initiated.
- `GET /institutions/:institutionId/verification/instruments` and `GET /verification/attempts` provide institution-scoped fixtures and attempt history to operators, reviewers, administrators, and auditors. `POST /verification/attempts` is restricted to institution operators and administrators. The deterministic provider records `match`, `mismatch`, `not_found`, and `unavailable` results with mode `simulated`, provider identity, and an explicit `NOT BANK CONFIRMED` label. The endpoint never updates the FDR's genuine verification status and never contacts a bank.

Important changes are written to the immutable audit log with actor, role snapshot, target, reason, and request ID. Workflow transition errors return `403` for insufficient role and `409` for a disallowed state change.
