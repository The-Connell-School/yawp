# Free-tier limits contract (I5)

`GET /api/internal/v1/free-tier/limits` and `PUT` at the same path use the existing
internal API HMAC signature, signed staff identity, management read/write scopes,
nonce replay protection and base free-tier access check. Bearer credentials are
not accepted. Sign the exact PUT body bytes. Responses have `Cache-Control:
no-store`. Query parameters, including environment overrides, are rejected.

Each deployment's database/schema owns its configuration. There is no remote
environment selector or process cache. No migration, secret change or flag
activation is required by this change.

GET returns this initial state without inserting a setting:

```json
{
  "studentSeatCap": 35,
  "lessonPlannerMonthly": 5,
  "reporterMonthly": 2,
  "updatedAt": null,
  "updatedByEmail": null,
  "version": 0,
  "bounds": {
    "studentSeatCap": [1, 200],
    "lessonPlannerMonthly": [0, 100],
    "reporterMonthly": [0, 100]
  }
}
```

Reads work with `free-tier-onboarding-v2` off, including persisted values from
earlier updates. Base `free_tier` access remains required. PUT requires the
onboarding flag globally enabled; off or targeted mode returns
`409 {"error":"flag_off"}`. Configured enforcement evaluates organization
targeting as well as base free-tier access. No flags are enabled by this API.

PUT accepts one or more of the three limit fields and a required integer
`version` equal to the last GET. Omitted fields retain their values. Example:

```json
{ "studentSeatCap": 40, "lessonPlannerMonthly": 0, "version": 0 }
```

Success returns the full state with version incremented, an ISO-8601 UTC
`updatedAt`, and `updatedByEmail` from the verified staff identity. Client-supplied
metadata and unknown fields are rejected. Missing/invalid versions, empty
updates and malformed JSON return 400. Each provided limit must be an integer
within its inclusive bounds (zero monthly quotas are valid); invalid limits
return `422 {"error":"out_of_bounds","field":"studentSeatCap"}` (or the
corresponding monthly field). Validation completes before any write.

`Setting.name = free_tier.limits.v1` stores the values, version and metadata in one
JSON value. Existing-row updates compare the entire previously read value in a
single SQL update. Initial writes use a unique-name insert with conflict skipping.
Both paths require exactly one affected row: a stale version or losing writer
returns `409 {"error":"version_conflict"}` without changes. There is no separate
read-then-unconditional-write or process-local lock. Successful HTTP writes call
the existing staff audit helper with key ID, actor email, endpoint, body digest
and result `success`; rejected writes do not record a successful audit event.
The helper retains its existing best-effort audit error handling.

## Entitlement integration and rollout

Defaults and bounds live in `domain/free-tier/limits.ts`. Existing
`FREE_CLASSROOM_STUDENT_SEAT_CAP` and `FREE_CLASSROOM_LESSON_PLAN_QUOTA` imports
remain available through `utils/entitlements.server.ts`. Callers that need edited
values resolve `effectiveFreeTierLimits(organizationId, client?)` and pass its
limits to `getEntitlementsForPlan`. The in-app usage reader uses that same policy.

The shared locked student enrollment check reads configured caps for v2
organizations. It counts active enrolled students plus unexpired pending invites,
including invitations without an expiry. Flag-off counting retains its prior
expiry filter. Verified student invitation acceptance consumes only its own
invitation inside the enrollment transaction before the locked capacity checks.
This converts the reserved seat to enrollment without counting it twice; all
other pending reservations still count. A failed capacity or budget check rolls
back consumption. Deleting the unique invitation prevents concurrent redemption
of the same reservation from admitting twice.
A lower cap blocks new adds and never removes memberships, disconnects students
or changes their access. Already-enrolled student admission keeps its existing
early success path. Non-free plans retain their current seat behavior. Teacher,
class and assignment caps are unchanged.

Monthly quotas mean calendar months in the teacher's organization timezone. The
current schema has no organization timezone field, so this implementation uses
the UTC fallback for every organization: inclusive first instant of the month,
exclusive first instant of the next month. It never uses the browser or host
timezone, a rolling 30-day window, or a teacher-supplied timezone. A future stored
organization timezone must be resolved in the shared month-window policy before
enabling timezone-specific behavior.

For v2 free-tier organizations, the existing Lesson Planner enforcement counts
`LessonPlanConversation.createdAt` records within that month, including deleted
records. Deleting a draft does not restore monthly uses. This reuses existing
records; it introduces no metering subsystem. With onboarding v2 or base free-tier
access off, the existing default quota of five undeleted lifetime drafts and its
existing message remain in effect. Paid-plan Lesson Planner behavior and its
separate feature-access gate remain unchanged. Existing drafts stay accessible.
The existing creation check is not a reservation mechanism for concurrent lesson
generation; this change preserves that existing limitation.

`reporterMonthly` is stored configuration for a future consumer. Reporter remains
disabled for free-tier plans, including when this value is nonzero or 100. This
API adds no Reporter permission, meter or route.

## Local verification

```sh
CI=1 ./bin/project test --profile internal-free-tier-limits --json
CI=1 ./bin/project test --profile internal-free-tier-limits-integration --json
CI=1 NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json
```

The integration profile requires a dedicated loopback database named
`yawp_ia-i5-limits` in the worktree's local config. It exercises separate database
pools with a barrier before competing writes, first-write and existing-version
races, separate-process reads, HTTP conflicts and durable replay checks, pending
invites, lower-cap enrollment compatibility, paid/flag-off/targeted behavior and
UTC month boundaries. Tests send no email or external requests. API-only changes
require no UI screenshots or hosted preview.
