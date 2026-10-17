# Duplicate class-code inspection

`GET /api/internal/v1/class-codes/duplicates` reads the environment-local database.
It requires the existing HMAC signature, signed acting staff email and
`management:read` scope. The shared verifier checks the raw query signature,
timestamp, rate limit and durable nonce replay protection. Bearer credentials are
not accepted. Responses are JSON with `Cache-Control: private, no-store` and
`Referrer-Policy: no-referrer`.

Class reporting follows the existing management directory access model. There is
no class-report feature gate. In particular `free_tier`,
`free-tier-onboarding-v2` and `classcode-unique` may all be off. The endpoint does
not turn on flags, change class codes, resolve collisions or affect onboarding.
As with other management reads, no write audit is invented. The shared verifier
still reserves request nonces; the reporting transaction itself is enforced
read-only by PostgreSQL.

## Parameters and paging

- `q`: optional canonical code prefix, trimmed, at most 200 characters before
  uppercase conversion. Matching uses ECMAScript `trim().toUpperCase()`, including
  Unicode expansions such as `ß` → `SS`. An empty prefix matches all groups.
- `limit`: decimal integer from 1 to 200, default 50; counts code groups.
- `cursor`: opaque versioned continuation, bound to the canonical prefix. Pass
  it unchanged alongside the same prefix. Limit may change between pages.

Unknown/duplicate parameters and malformed queries return 400 `Invalid query`.
Malformed, noncanonical or filter-incompatible cursors return 400 `Invalid cursor`.
Missing/invalid signatures return 401, missing scopes 403, unconfigured signed
integration 404, non-GET methods 405 and database unavailability 503. Authorization
is checked before query validation or class-data access. Denials contain no class
metadata.

The response is `{ items, nextCursor, totalCodes }`. Items contain `code`, `count`
and `classes`. Unique codes are omitted. Groups and class IDs use the shared
report's deterministic ECMAScript string order, including archived classes and
cross-organization collisions. Entire groups stay together. `totalCodes` counts
matching groups before pagination; `nextCursor` is null on the final page.
Keyset paging avoids gaps or repeats on a stable dataset; separate requests may
observe concurrent changes. Each page uses one repeatable-read snapshot for
grouping, counts, relations and activity.

## Metadata sources and read cost

Each class returns `classId` (`Class.id`), `className` (`Class.title`, falling back
to its stored code when null), `organizationId`, `organizationName`, `schoolId`,
`schoolName`, `teacherEmails`, `studentCount`, `createdAt` and nullable
`lastActivityAt`. Organization metadata comes through `Class.school.organization`.
Teacher emails come from the existing class teacher membership/user relation,
deduplicated and sorted in ECMAScript string order. `studentCount` counts the
existing class student roster relation, including inactive memberships still on
that roster. Empty relations return `[]` / `0`.

`lastActivityAt` is the maximum existing `Document.updatedAt` for documents linked
through `Document.classAssignmentId` → `ClassAssignment.classId`. It measures
persisted document activity, including archived/deleted documents. It does not
claim to measure logins, class metadata edits, or all teacher actions. Documents
without that class deployment link do not contribute. With no linked documents,
the value is null; class creation time is never substituted. Both timestamps are
serialized as UTC ISO-8601 strings with milliseconds.

Exact legacy Unicode parity with `normalizeClassCode`, `groupDuplicateClassCodes`
and `readDuplicateClassCodes` requires an environment-wide scan of class IDs,
stored codes and tenant keys. Database `upper()` / `lower()` cannot safely replace
that comparison. Only the selected page's class metadata and relation counts are
loaded. One batched SQL aggregate fetches activity for those page class IDs;
there are no per-class query loops or global teacher/student/document loads.
No migration or production snapshot is needed.

## Local verification

Use the project CLI with `CI=1`:

```bash
./bin/project capabilities --json
./bin/project doctor --json
./bin/project test --profile internal-class-code-duplicates --json
./bin/project test --profile internal-class-code-duplicates-integration --json
NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json
```

The integration profile uses worktree-local config, requires a dedicated loopback
database whose name starts with `yawp_ia-i3-dupes`, creates disposable fixture
relations, and removes them afterward. It checks report parity, real metadata,
all-rollout-flags-off reads, durable replay, complete-group paging, unchanged
domain data and PostgreSQL rejection of an injected domain write. CI explicitly
runs both new test files in separate processes. This change has no UI;
Playwright screenshots and hosted demo QA are not required.
