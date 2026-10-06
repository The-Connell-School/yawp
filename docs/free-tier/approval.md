### Free-tier approval internal API (F4)

Auth: All endpoints require Authorization: Bearer YAWP_MANAGEMENT_SERVICE_KEY. Same error patterns as existing api.internal.v1.free-tier.* (404 when key unset; 401 on wrong/missing bearer; 503 if key malformed).

Base path: /api/internal/v1/free-tier/approval

- GET /approval/queue
  - Query: q (search string), status=ADMIN_SUBMITTED|MANUAL_REVIEW, cursor, limit (1–100, default 50)
  - Response: { applications: [ { id, createdAt, updatedAt, status, name, email, schoolName, location, gradeLevel, acquisitionTokenId, releasedAt, approvalDecisions: [ { id, createdAt, decision, reason, decidedByEmail } ] } ], counts: { ADMIN_SUBMITTED, MANUAL_REVIEW }, nextCursor }

- GET /approval/applications/:id
  - Response: { application: { ...application fields..., approvalDecisions: [ ... ] } }

- POST /approval/:id/approve
  - Body/header: decidedByEmail (either JSON body field or X-Yawp-Operator-Email header)
  - Allowed from: MANUAL_REVIEW | SENT
  - Response: 200 { ok: true } (or { ok: true, idempotent: true } if already approved); 409 on race/illegal state

- POST /approval/:id/reject
  - Body: { reason: string (required, ≤2000 chars) } and decidedByEmail as above
  - Allowed from: MANUAL_REVIEW | SENT | ADMIN_SUBMITTED
  - Response: 200 { ok: true }; 409 on race/illegal state

- POST /approval/:id/mark-manual-review
  - Body/header: decidedByEmail
  - Allowed from: ADMIN_SUBMITTED | SENT (idempotent if already MANUAL_REVIEW)
  - Response: 200 { ok: true }

- POST /approval/:id/reopen
  - Body/header: decidedByEmail
  - Allowed from: REJECTED → sets MANUAL_REVIEW
  - Enforces the same release-cap headroom as F3 (`free_tier_release` advisory lock; compares against FREE_TIER_RELEASE_CAP). Returns 409 when the cap is reached.

- POST /approval/:id/submit (utility)
  - Moves ACCOUNT_CREATED → ADMIN_SUBMITTED to unblock flows not yet wired end-to-end.
  - No decidedByEmail required.

Audit log
- Table: FreeTierApprovalDecision { id, createdAt, applicationId, decision APPROVED|REJECTED|MANUAL_REVIEW|REOPENED, reason?, decidedByEmail }
- Every action appends a row; application status transitions are done via conditional updates, race-safe and idempotent on already-in-target state.

Hooks
- app/domain/free-tier/approval-hooks.server.ts exports onApplicationApproved / onApplicationRejected hooks (no-op by default). F5 provisioning and notifications will attach here.

Examples

Approve:
curl -X POST -H "Authorization: Bearer $YAWP_MANAGEMENT_SERVICE_KEY" -H "X-Yawp-Operator-Email: ops@yawp.local" https://yawp.test/api/internal/v1/free-tier/approval/abc123/approve

Reject:
curl -X POST -H "Authorization: Bearer $YAWP_MANAGEMENT_SERVICE_KEY" -H "Content-Type: application/json" -d '{"reason":"not eligible","decidedByEmail":"ops@yawp.local"}' https://yawp.test/api/internal/v1/free-tier/approval/abc123/reject

