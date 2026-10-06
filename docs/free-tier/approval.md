### Free-tier approval internal API (F4)

Approval is required before a free account goes live. Operators work the queue from
yawp-internal (`/free-tier/approvals`), which calls this API server-side with the
management key.

Auth: every endpoint requires `Authorization: Bearer $YAWP_MANAGEMENT_SERVICE_KEY`,
using the same check as the other `api.internal.v1.free-tier.*` endpoints (F3):
404 when the key is unset, 503 when the configured key is malformed, 401 on a
missing/wrong bearer.

Base path: `/api/internal/v1/free-tier/approval`

#### Reads

- `GET /approval/queue`
  - Query (unknown params → 400): `q` (search name/email/school), `status` = `ADMIN_SUBMITTED` | `MANUAL_REVIEW` | `SENT` (omit for all three), `cursor` (opaque, from `nextCursor`), `limit` 1–100 (default 50)
  - 200 `{ applications: [ { id, createdAt, updatedAt, status, name, email, schoolName, location, gradeLevel, acquisitionTokenId, releasedAt, approvalDecisions: [ { id, createdAt, decision, reason, decidedByEmail } ] } ], counts: { ADMIN_SUBMITTED, MANUAL_REVIEW, SENT }, nextCursor: string | null }`
  - `counts` are totals per queue state (not filtered by `q`/`status`).
- `GET /approval/applications/:id`
  - 200 `{ application: { ...same fields..., approvalDecisions: [...] } }`, 404 if unknown.

#### Decisions

All decisions need an operator email, from the `X-Yawp-Operator-Email` header or the
JSON body field `decidedByEmail` (header wins). Invalid/missing → 400.

| Action | Allowed from | Result |
| --- | --- | --- |
| `POST /approval/:id/approve` | ADMIN_SUBMITTED, MANUAL_REVIEW, SENT | APPROVED |
| `POST /approval/:id/reject` (JSON `{ reason }`, 1–2000 chars) | ADMIN_SUBMITTED, MANUAL_REVIEW, SENT | REJECTED |
| `POST /approval/:id/mark-manual-review` | ADMIN_SUBMITTED, SENT | MANUAL_REVIEW |
| `POST /approval/:id/reopen` | REJECTED | MANUAL_REVIEW |

Approve is allowed from every state the queue shows. The AI check that will route
ADMIN_SUBMITTED to SENT / MANUAL_REVIEW does not exist yet, and staff overrides are
allowed and audited (spec §6.5), so nothing in the queue is a dead end.

Responses:
- 200 `{ ok: true, status, previousStatus }` when the state changed (one audit row written).
- 200 `{ ok: true, idempotent: true, status }` when already in the target state: no audit row, no hook call. Retries and double-clicks are harmless.
- 409 `{ error: 'Illegal state', status }` when the current state is not an allowed source.
- 409 `{ error: 'Conflict' }` when a concurrent decision changed the row first (conditional update matched nothing). Re-fetch and retry if still appropriate.
- 409 `{ error: 'Release cap reached' }` on reopen when an unreleased application would exceed `FREE_TIER_RELEASE_CAP` (same `free_tier_release` advisory lock as F3). Released applications already hold a slot and reopen without a cap check.
- 404 unknown id, 400 bad input, 413 oversized body.

`POST /approval/:id/submit` (utility): ACCOUNT_CREATED → ADMIN_SUBMITTED until the
teacher flow is wired; idempotent; 409 from any other state. No audit row.

#### Audit log

`FreeTierApprovalDecision { id, createdAt, applicationId, decision APPROVED|REJECTED|MANUAL_REVIEW|REOPENED, reason?, decidedByEmail }`.
Written in the same transaction as the status change, so every real transition has
exactly one row. yawp-internal also writes its own `audit_event` row per action.

#### Hooks

`app/domain/free-tier/approval-hooks.server.ts`: `onApplicationApproved(app)` and
`onApplicationRejected(app, reason)`, no-op by default. They run after the decision
commits, only when the state actually changed. A hook error is logged
(`free_tier_approval_hook_failed`) and never undoes the decision, so F5 provisioning
must be idempotent and retryable from the audit log.

#### Migration / rollback

`20261006114822_free_tier_approval_decisions` is additive (new enum, new table, index,
FK to `FreeTierApplication` with cascade). Rolling back the app code leaves the table
unused; no existing table changes.

#### Examples

```sh
curl -X POST -H "Authorization: Bearer $YAWP_MANAGEMENT_SERVICE_KEY" \
  -H "X-Yawp-Operator-Email: ops@example.org" \
  https://yawp.school/api/internal/v1/free-tier/approval/abc123/approve

curl -X POST -H "Authorization: Bearer $YAWP_MANAGEMENT_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason":"not eligible","decidedByEmail":"ops@example.org"}' \
  https://yawp.school/api/internal/v1/free-tier/approval/abc123/reject
```
