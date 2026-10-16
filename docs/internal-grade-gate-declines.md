# Grade-gate decline contract (I4 / fto-free-page)

I4 owns `FreeTierApplication.tags`, the literal `below-hs`, and decline
persistence. The public free-page lane consumes these exports and owns grade
selection, presentation, public request validation and throttling. No public
route calls the new writer in this PR; existing signup behavior stays unchanged.

## Storage and public integration

- Migration `20261016190000_free_tier_application_tags` adds `tags String[]`
  with an empty default. Existing records are not classified or backfilled.
  Require independent review and a manager RDS snapshot before driver merge
  and any production migration. Do not add a second tags migration.
- Import `BELOW_HS_TAG`, `isBelowHsGrade`, and `withBelowHsTag` from
  `domain/free-tier/grade-gate`. Supported explicit selections are `K`, `1`–`8`;
  free-text historical grades are never interpreted. `withBelowHsTag` retains
  other tags, does not mutate its input, and adds the tag at most once.
- Import `recordBelowHsDecline` from `domain/free-tier/grade-gate.server`.
  It accepts the existing waitlist fields (name, email, schoolName, location,
  gradeLevel, optional middleName honeypot) and an optional acquisition-token
  **credential** named `token`. Never accept caller-provided tags or token IDs.
  Email is trimmed and lowercased using the existing input contract. Grade must
  be an explicit supported below-HS selection.
- The function owns its transaction; call it before ordinary waitlist submission
  or token redemption, outside another transaction. It checks the anonymous
  `FREE_TIER_ONBOARDING_V2_FLAG`: off, targeted, missing or unreadable flags
  return `409 { "error": "flag_off" }` before application persistence. The
  caller retains the public free-tier gate and existing body/rate limits.
- Valid input returns a no-store `200 { "ok": true }` for new, repeated and
  already eligible addresses. A new record has status `REJECTED`, tag
  `below-hs`, and no release time, user or organization. A honeypot is a no-op.
  Create-only `ON CONFLICT DO NOTHING` preserves every existing application,
  including its tags, personal fields, status and token provenance. Repeated
  concurrent submissions produce at most one application and reveal no IDs or
  existence information. A later high-grade submission does not clear a decline.
- A provided token must resolve through the existing code/hash lookup and pass
  disabled, expiry and capacity validation. Invalid input/token returns 400.
  The token relation records its current label and source context for Internal;
  no token use, slot, signed link, account, enrollment or email is created.
  Token provenance is first-write-only, including a first organic submission.
- The transaction shares the existing admission lock with bypass-token redemption
  and operator release. Existing tagged applications cannot consume token uses,
  be released, reopened or approved through operator transitions, even with v2
  off. Token redemption returns the existing generic waitlist success response
  (`bypassWaitlist: false`) for a tagged application.
- Original admission-email copy context belongs to the free-page implementation;
  this decline-only writer schedules no admission email. I4 adds no copy-version
  field or eligible-admission helper. The public lane still needs to enforce
  the grade selection across `/free`, waitlist and token request entry points.

## Signed read

`GET /api/internal/v1/free-tier/grade-gate-declines` uses the existing free-tier
base feature gate and HMAC verifier with `management:read` and signed acting
staff email. It requires HMAC even when legacy bearer support is enabled. No
application reads occur on failed authorization. No new read-audit mechanism is
introduced; staff attribution remains in the shared verified auth context.
The onboarding-v2 flag does not gate this read.

Query parameters: optional `q` (trimmed, at most 200 characters; case-insensitive
name/email/schoolName), `from` and `to` (inclusive), opaque `cursor`, and `limit`
(default 50, range 1–200). Dates accept `YYYY-MM-DD` as midnight UTC, or an ISO
timestamp with `Z`/explicit offset. To include a whole final day, supply its end
timestamp. Invalid dates, reversed ranges, duplicate/unknown parameters and
malformed or filter-mismatched cursors return 400.

The response is `{ items, nextCursor, total }`, with the exact I4 fields and UTC
ISO `createdAt`. Token ID and label are null when absent. Only explicitly tagged
records are included, regardless of status. Ascending unique-ID keyset pagination
is stable across equal/sub-millisecond timestamps and deleted cursor rows; cursor
version and normalized text/date binding are validated. `total` ignores pagination
and uses the same filters within the page's repeatable-read transaction. Totals
can change between requests as new data arrives. No CSV addition is included.

## Local verification

Run `CI=1 ./bin/project test --profile internal-grade-declines --json`,
`CI=1 ./bin/project test --profile internal-grade-declines-integration --json`,
and `CI=1 ./bin/project test --profile typecheck --json`. Integration requires
the dedicated loopback I4 database created by `./bin/project bootstrap --json`
with migrations applied. It restores local flag values and removes its own rows.
All test files run sequentially to isolate Bun module mocks. No UI changes or
screenshots are required. Broader checks and independent Ship Review remain CI
and driver handoff requirements; no deployment or merge is performed here.
