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

## Landed delivery integration and merge gate

Dependency #581 landed in main as `634687035`. The existing shared helper now
selects eligible v2 delivery before checking `requireV2`; rejection remains
immediately before legacy fallback. Flag-off, untargeted and missing-user staff
writes therefore return `409 flag_off` without any legacy email send. Teacher
callers retain their existing fallback. No delivery engine or schema is copied.

The dedicated PostgreSQL profile runs through the actual signed route, capturing
only the provider and disabling provisioning hooks in local test fixtures. The
HMAC verifier, durable nonce store, Prisma, advisory locks, shared adapter,
delivery engine and persisted audit are exercised together. A controlled clock
covers accepted delivery, immutable acceptance after later manual/automatic
reminders, concurrent same/different keys, the exact ten-minute boundary,
recovered legacy evidence, shared four-reminder cap, forwarding/approval races
in both orderings, provider rejection and transport uncertainty. No actual email
leaves the test process. A concurrent same-key caller can observe DELIVERING
before acceptance and receive `502 email_failed`; it never receives invented
success. Fresh signed same-key retries after acceptance return the original
immutable response without another provider call.

Teacher follow-up reads also reconcile migrated zero counters against accepted
logs per administrator lifetime. Matching acceptances count once, failed logs
never count, and the latest accepted date wins. This changes public read
projection only; cadence and persisted follow-up filtering remain unchanged.

Run `CI=1 ./bin/project test --profile internal-approvals --json` and
`CI=1 ./bin/project test --profile internal-approvals-integration --json` against
an isolated local database with all existing migrations applied. Rerun the
landed `approval-v2.real-db.integration.test.ts` suite separately. Final-head green
CI and fresh independent Ship Review APPROVE remain mandatory before the driver
merges. Keep the PR draft until those gates pass. No new migration, flag
activation, real email, UI change or screenshots are part of I1.
