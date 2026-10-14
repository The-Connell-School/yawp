# Read-only Audit migration

Signed-only GET routes under `/api/internal/v1/admin/audit` expose
`document-writes`, `ai-logs`, and `document-writes/:id`. Configure existing
`YAWP_INTERNAL_API_KEYS` with `audit:read`. Requests carry a signed staff email,
require an empty body, and responses use `Cache-Control: no-store`. Successful
reads are attributed in `InternalPlatformApiAudit`. The existing `/api/internal/v1/audit`
API continues to serve its separate API audit dataset.

Lists default to 25 entries, max 100, ordered by createdAt/id descending.
Cursors bind the dataset and normalized filters and use a strict timestamp/id
boundary. Document writes preserve user/email/name or membership lookup,
documentId, requestId and date filters. AI logs preserve documentId,
submissionId, feature, kind and dates. User/email/request filters do not apply
to AI logs, matching the legacy loader. Dates must be valid and ordered.
Document text previews remain capped at 220 characters plus an ellipsis.
All list/detail metadata recursively removes replayUrl.

`INTERNAL_ADMIN_AUDIT_MOVED=true` stages legacy navigation/list/detail entry
migration. It defaults off: existing readers remain available. Enable only
after the companion Internal page has been reviewed and deployed. The enabled
gate requires platform admin authentication before returning the moved notice
and reads no Audit payloads. `YAWP_INTERNAL_URL` defaults to the Internal host;
`YAWP_ENVIRONMENT=production` selects production, otherwise demo. Revert the
switch to restore the legacy reader during rollout. There are no schema changes
or document/AI-log mutations.
