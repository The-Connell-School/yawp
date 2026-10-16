# Signed approval history and staff resend (I1)

Queue and detail retain their existing fields and authorization. Both include
`adminRequest`, `teacherFollowUps` and `forwards`; detail includes `emailLog`
inside `application`. Reads do not require onboarding v2 to be enabled.

Dates are UTC ISO strings. An application with no administrator row has
`adminRequest: null`. `firstSentAt` is nullable when no accepted original email
exists, including historical rows; row creation is never delivery evidence.
Legacy reminders count successful `admin_approval_reminder` logs only, matching
the administrator address and that row's lifetime. Their source is null because
historical logs do not prove automatic/manual attribution. With #581's schema,
reminder history reconciles accepted logs with persisted metadata even while v2
is off. The count is at least the accepted-log count; logs strictly newer than
the persisted last acceptance extend its counter. Matching acceptance timestamps
count once (#581 writes the same timestamp to the counter and its email log).
This recovers migrated zero defaults and legacy reminders sent during a rollout
pause without adding overlapping counts. The newest accepted timestamp wins;
its source is null if only historical email evidence proves that send. Persisted
source remains available for a matching or newer persisted acceptance. Reads do
not change cadence, stop state or persisted follow-up filtering.
Teacher follow-ups aggregate all rows
and use the latest actual accepted follow-up. Legacy rows fall back to successful
teacher-follow-up logs.

Forward edges use `redirectedFromId`, ordered oldest first. `approvalId` identifies
the previous row, `forwardedAt` is its `decidedAt`, and `byRole` comes from the
replacement row. Both are nullable for historical rows without evidence. Never
infer staff/admin/teacher identity from an address or application status.

`?needsFollowUp=true` filters persisted pending administrator follow-up state
before paging and grouped counts. Search and status also constrain those filtered
counts. Without this option, existing global status counts retain their previous
meaning. Cursors bind the filter; existing unfiltered cursors retain their format.
Before the cadence schema exists there is no persisted follow-up state, so this
filter returns no matches. The adapter selects available schema fields from an
explicit allowlist, supporting current main and #581 without a second migration.

Detail queries the newest 50 email logs, breaking timestamp ties by descending ID.
It returns only `kind`, `toEmail`, `sentAt`, `success`, `error` and maps
`admin_approval_reminder` to `admin_reminder`. `sentAt` on a failed log denotes
attempt time; `success` distinguishes acceptance. Failed errors are normalized to
`email_failed`; successful errors are null. Raw provider error text, log payloads,
signed links, request fingerprints and encrypted delivery content are not read
or returned. Delivery evidence is queried independently of the 50-row display.

Staff POST `/api/internal/v1/free-tier/approval/:id/resend` requires a signed
management write, verified actor, body integrity, nonce/freshness protection,
free-tier access, JSON `{ "reason"?: string }` (maximum 280 characters) and
`Idempotency-Key` (1–200 ASCII letters, digits, `.`, `_`, `:`, `-`). Application ID
comes from route parameters. Unknown fields, including body identity, are rejected.
Every delegated outcome is audited with verified key/actor, application ID,
manual source, optional reason, request hash and safe outcome. Responses have
`no-store` and `no-referrer`. No bearer fallback exists for this endpoint.

Success returns only immutable accepted `ok`, `sentAt`, `reminderCount`, `toEmail`
and `nextAutoReminderAt`. Date objects from the shared helper become UTC ISO.
State/cooldown/rollout denials map to 409, invalid helper input to 400 and delivery
failure to 502. An absent application returns 404. Each retry needs a fresh signed
nonce and the same idempotency key. The shared helper owns acceptance replay,
locking, cooldown, shared four-reminder cap, forwarding races and uncertainty.
Manual acceptance leaves the weekly slot unchanged.

## Dependency and merge gate

#581 owns delivery, schema and race coverage. This PR adds a `requireV2` guard
before the legacy helper, leaving teacher callers unchanged. On current main,
all staff resends return `409 flag_off` without sending. This PR is deliberately
a draft until #581 lands and integration is verified. It must not merge in its
current dependency-incomplete state.

During integration, preserve #581's eligible-v2 dispatch, then place `requireV2`
rejection immediately before its legacy fallback. Pass actor/idempotency arguments
through to the durable helper. Never move the guard after the legacy send or
allow a disabled/untargeted/site-account request to fall back. Update the real-DB
fixtures to exercise persisted cadence and run #581's captured-delivery tests for
same/different keys, immutable replay after later sends, ten-minute boundary,
automatic/manual cap, forwarding/approval races, rejection and uncertainty.
Adapter-only tests do not prove these shared delivery guarantees. Final-head green
CI and independent Ship Review APPROVE are required before the driver merges.
No migration, flag activation, real email, UI change or screenshots are part of I1.
