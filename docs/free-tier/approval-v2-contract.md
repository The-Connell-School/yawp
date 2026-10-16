# Approval delivery and the I1 consumer

This P5/P6 change owns cadence, forwarding and delivery. Internal-api owns the
signed `/api/internal/v1/...` approval reads and staff resend endpoint. No flag is
activated by this change. `free-tier-onboarding-v2` defaults off; site account
memberships and organizations outside a targeted rollout retain the legacy flow.

## Storage and reads

`FreeTierAdminApproval` is the cadence unit, one row per administrator. Read the
new nullable `firstSentAt`, `lastReminderAt`, `lastReminderSource`,
`nextAutoReminderAt`, `stopReason`, `lastTeacherFollowUpAt`,
`nextTeacherFollowUpAt`; integer `reminderCount`, `teacherFollowUpCount`; boolean
`autoRemindersStopped`, `needsManualFollowUp` directly for I1. Timestamps are UTC.
`firstSentAt` means the first provider-accepted original approval message to that
administrator, never row creation or a failed attempt. Enrollment recovers actual
first-send time and successful prior reminders from that administrator's email
logs since the approval row's creation. Every scheduling, manual acceptance and
dispatch check reconciles successful legacy reminders, including sends while
the rollout was paused. A delivery and its matching log (payload `deliveryId`)
count once; failed logs never count. Recovery preserves the weekly slot and any
manual stop, updates the last accepted send/source, and stops administrator
reminders at the shared cap. Existing rows remain readable with the
flag off. Flags only gate behavior and the new teacher/admin UI.

History follows `redirectedFromId`, oldest first. The replacement row records
`forwardedByRole` (`teacher` or `admin`); the previous row's `decidedAt` is the
forward time. Previous rows have `REDIRECTED`, `stopReason=forwarded`, no next
reminders. I1 can map these to its `fromAdmin*`, `toAdmin*`, `forwardedAt`, `byRole`
shape. Teacher follow-up totals are the sum of `teacherFollowUpCount` across the
application's rows, with the latest `lastTeacherFollowUpAt`. The current row's
count starts at zero after a forward. Flag-off legacy forward rows have no role.

`FreeTierEmailLog` retains existing `admin_approval_reminder` for compatibility;
I1 maps that to `admin_reminder`. New kinds are `teacher_followup` and
`forward_notice`. New log payloads contain only delivery ID, approval ID and
source. The outbox stores encrypted message text containing signed URLs; never
return its `payload` to Internal or a browser. No signed URLs enter new logs.
`needsManualFollowUp=true` covers both four-resend completion and uncertain
provider outcomes. Terminal applications have no next cadence; expired/rejected
requests use `stopReason=manual` because I1's vocabulary has no closed value.

## Manual and weekly semantics

Call the existing `resendFreeTierAdminApprovalReminder` with applicationId,
request, optional idempotencyKey (required by the I1 route), and actorEmail (staff
identity, already verified by Internal-api). Success remains `ok:true` only after
delivery acceptance; it additionally returns sentAt, reminderCount, toEmail, and
nextAutoReminderAt. Legacy callers need only inspect `ok`. I1 owns its audit
record and HTTP status mapping. V2 failures are flag_off, not_allowed,
already_decided, rate_limited, invalid, or email_failed. Failed delivery never
increments counts. Replaying the same key returns the original acceptance
without sending again; keys are scoped to one current administrator. The
delivery stores immutable `acceptedReminderCount` and
`acceptedNextAutoReminderAt` with `sentAt` in the acceptance transaction. Later
manual/automatic sends and reconciliation do not change that response. The
additive acceptance migration backfills earlier accepted delivery slots from
their sequence and preceding automatic cadence, without using today's mutable
approval counter.

Manual and automatic successful reminders share `reminderCount`, capped at four
per administrator after the original send. Manual requests have a ten-minute
cooldown against both the last accepted send (including recovered legacy sends)
and outstanding deliveries, and cannot bypass the cap. Exactly ten minutes is
eligible. Dispatch also checks the accepted-send cooldown after a rollout pause.
A pending manual delivery excludes another
manual or automatic delivery for that same counter slot. Manual delivery does
not move the next weekly slot; all admin reminders have at least ten minutes
between accepted sends. Automatic delivery uses the original weekly anchor and
skips missed slots rather than catching up in a burst. Rejected attempts retry
at most five times, an hour apart. Forwarding starts a fresh four-resend series
at the new administrator's first successful send, invalidates both old purposes,
and queues a teacher notice in the same transaction. An address requiring review
enters MANUAL_REVIEW and queues only the teacher notice until approved by staff.

Teacher follow-ups continue weekly while the application is SENT and the current
approval is PENDING, including after the fourth administrator resend. They stop
on approval, rejection, expiry, forwarding, a disabled rollout or a non-target/site
account. MANUAL_REVIEW is ineligible for weekly messages. A forward starts the
new teacher cadence only after the new administrator's original email succeeds.
A disabled/untargeted rollout pauses queued work; re-enabling resumes eligibility
checks without catch-up bursts. Queued links near/past expiry are replaced before
an attempt. Every dispatch rechecks current ownership/status/rollout under the
same application lock used by forwarding and signed-link approval.

## Durable worker and delivery uncertainty

The application entry starts one bounded polling loop per production process,
using the existing delivery-loop pattern. Local runs leave it disabled unless
explicitly enabled. Each drain uses keyset batches of 100, so earlier paused or
stale rows cannot starve later work. Unique (approvalId, kind, sequence) rows and
application advisory locks prevent duplicate scheduling and concurrent sends.
The loop handles pending work after process restarts; due times live in Postgres.

DELIVERING is committed before contacting the provider. Provider SDK retries are
disabled for these messages. Only explicit HTTP 4xx rejection (except timeout)
is safely retried automatically. Network failures, ambiguous acceptance,
interruption after claiming, corrupt payloads, and exhausted rejection retries
become UNCERTAIN with manual-follow-up state. They are never blindly re-sent.
After an interruption, the next drain marks claims older than ten minutes for
manual reconciliation. Operators must inspect provider acceptance before any
future recovery tooling requeues a message. This conservative boundary avoids
duplicate delivery without claiming an atomic transaction with an email provider.
No reconciliation endpoint or actual email send is part of this development/QA.

## Approval UI and review

Waiting uses UTC sent-date details and an encoded mailto; forwarding uses the
session owner or a current signed administrator link. Both link purposes are
invalidated on forward. The administrator page has information on the left and
the existing approval form on the right, stacked on mobile. An empty
`data-guide-slot=administrator` accepts future supplied guide content; no guide
or video content is invented. All approval validation and link budget protections
remain in the existing transaction.

Apply the additive migration locally for tests only. The driver must take an RDS
snapshot before any production application. Merge remains held by state/MERGE_HOLD
until explicitly released; CI and independent Ship Review approval are required.
