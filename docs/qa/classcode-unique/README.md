# Class-code uniqueness: rollout and review

`classcode-unique` defaults off in every environment. It is independent of
`unified-sign-on` and `free-tier-onboarding-v2`. Only **everyone** mode enables
it: targeted mode stays off because a global invariant must cover every writer.
No flag is activated by this change. The lane backlog requires this flag even
though Brian's October 16 plan describes P1 as an unflagged bug fix.

## Comparison and the I3 report contract

Use `normalizeClassCode(code)`: ECMAScript `code.trim().toUpperCase()`. This is
also the comparison used for generated candidates and all authoritative checks.
It covers legacy lowercase, whitespace, and Unicode expansion (for example
`ß` and `SS`). Do not substitute PostgreSQL `upper(btrim(code))`, database
collation, or locale-sensitive casing: those can disagree with ECMAScript.
All classes reserve their codes, including archived classes. Empty legacy codes
are reportable; newly generated codes are six uppercase letters/digits from the
existing alphabet. Existing codes are never automatically resolved or renamed.
An edit whose canonical code equals that class's current canonical code retains
the exact stored code, including when historical duplicates exist.

Run the report against the isolated worktree database:

```bash
CI=1 ./bin/project test --profile classcode-report --json
```

The underlying command is `services/web-app/scripts/report-class-code-duplicates.ts`;
it requires `DATABASE_URL` and emits `{ comparison, includesArchivedClasses, items }`.
Its database transaction executes `SET TRANSACTION READ ONLY` before the SELECT.
Each item is:

```json
{
  "code": "ENG11A",
  "count": 2,
  "classes": [
    { "classId": "class-a", "storedCode": " eng11a ", "schoolId": "site-a", "organizationId": "org-a" },
    { "classId": "class-b", "storedCode": "ENG11A", "schoolId": "site-b", "organizationId": "org-b" }
  ]
}
```

Groups sort by canonical code using JavaScript ordinal comparison; classes sort
by class ID. `groupDuplicateClassCodes` and `readDuplicateClassCodes` are exported
for the internal-api lane to reuse. That lane retains ownership of the signed
`/api/internal/v1/class-codes/duplicates` endpoint, enrichment and pagination.
Prefix searches must normalize the prefix with the same function. This change
does not add an Internal endpoint or register `free-tier-onboarding-v2`.
The local fixture proof includes same-organization and cross-organization
legacy duplicates; it compares persisted rows before and after the report.
No hosted database report has been run. `duplicates.local.json` records the
read-only command against disposable local scenario fixtures; it is not a
report of demo or production. `checks.json` records the passing focused runs.

## Write-path audit and concurrency

| Path | Policy when enabled | Existing boundaries retained |
| --- | --- | --- |
| Organization create/duplicate | Guard inside existing transaction; generated candidates get at most four checks | Owner/membership checks, organization class cap, join token, teacher connections |
| Organization edit | Guard and update in same transaction | Organization ownership, school selection, teacher connections |
| Teacher create | Guard inside existing transaction; generated candidates get at most four checks | Teacher role, allowed sites, class cap, join token, art, membership |
| Teacher edit (including class detail sheet) | Guard and update in same transaction | Teacher ownership, allowed sites, existing co-teachers |
| Automatic free-classroom provisioning | Generated candidates checked inside provisioning transaction | Application idempotency, account routing, membership, bundle, application link |
| Local Internal scenario creation | Guard within scenario transaction | Trusted binding, seat limits, receipt idempotency |

All guarded writes acquire `pg_advisory_xact_lock(1869666150, 1)` and retain it
through commit or rollback. Availability is read **after** acquiring the lock.
Generated collisions are detected before INSERT, so retries do not reuse an
aborted PostgreSQL transaction. Exhaustion throws and rolls back the whole
transaction, including provisioning's earlier organization/site/member writes.
Concurrent admin/teacher POSTs and cross-organization transactions are covered.
No code availability or other organization's details are returned to clients;
collisions return only the generic error with `field: "code"`.

LTI enrollment, roster changes, join-token updates, and bulk class metadata edits
do not change codes and retain their existing behavior. Local seeds, import,
maintenance, and direct SQL tools are outside the application write boundary;
any such code-writing tool must adopt the guard before use while the feature is
active. All running application instances must have this change before a future
activation, with earlier writes drained. Do not activate during a rolling
upgrade. No hosted activation is part of this PR.

## Migration decision

No Prisma schema change or migration is needed for the audited application
writes: the transaction lock provides serialization while the flag is on and
leaves the existing `Class(schoolId, code)` constraint in place. Flag off keeps
legacy cross-organization duplicates and existing generated-code behavior.
The enabled path scans class IDs/codes under a global lock so it can apply exact
ECMAScript normalization. This is O(total classes) per code write and serializes
code writes; assess report size and write latency before any wider rollout.
It is an application guarantee, not a constraint on arbitrary database clients.

A future additive canonical-code column plus global unique index could remove
that scan and enforce maintenance writes too. That is a **separate migration**:
first run the read-only report on the intended environment, have the manager
arrange the RDS production snapshot and manual duplicate resolution, and define
a canonical backfill matching ECMAScript. An unconditional global unique index
would reject legacy writes even with this feature flag off, so it cannot be
silently added to this flag-compatible release. Index/backfill implementation
must remain held before merge until the manager clears the snapshot, duplicates,
and flag-off rollout semantics. This PR includes no migration SQL and applies
nothing to hosted environments.

## Local validation and screenshots

All commands use `CI=1` and the worktree's `./bin/project` runtime interface:

- `test --profile classcode-unit --json`: focused helper, admin/teacher, provisioning analytics, component and registry regressions.
- `test --profile classcode-db --json`: local PostgreSQL collisions, edits, concurrent writes, report, provisioning rollback, enrollment and scenario regression fixtures. Uses a simulated demo route gate with preview accounting solely in the local test process; the production flag-off regression remains included.
- `test --profile classcode-browser --json`: one Playwright worker; admin/teacher forms at 1280px and 390px, flag off, generation without submission, collision field errors, owner-only endpoint denial, side-by-side images.
- `test --profile classcode-enter-code --json`: existing cross-organization enrollment and duplicate-denial browser regression against local simulated demo configuration.
- `test --profile classcode-report --json`: read-only local report command.
- `test --profile project-cli --json`: project interface and deployment-contract regressions.
- `NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json`: typecheck; the default 2GB heap was insufficient. Existing duplicate LTI route-ID warnings remain.

Screenshot directory (lane-local because of the workspace write boundary):
`/home/bryant/work/yawp/codex-loop/lanes/di-signon-secrets/shots/classcode-unique/`.
For each `admin`/`teacher` and `1280`/`390`: `*-before.png`, `*-generated.png`,
`*-collision.png`, and `*-side-by-side.png`. `enter-code/` contains the existing
enrollment flow evidence. Before images use the flag-off form. The v2 artboard
catalog has My Classes and sign-in entry boards, but no class-management sheet
or Generate code artboard; no applicable artboard image was substituted.
Existing input/button/tokens are used, with no new gradient or sign-in changes.

Focused tests and browser spec were written before route/UI implementation.
Initial runs were blocked by incomplete dependency extraction, read-only Prisma
cache, then a missing pinned browser binary; recovery used lane-private caches
and the existing Chromium executable. An unchanged-legacy-code test was also
observed failing before its preservation fix. Hosted QA is outside this task.

Before driver merge: require green CI and independent Ship Review **APPROVE**.
Ship Review must check flag-off behavior, the test results, screenshot pairs,
comparison/report contract and application-level concurrency limitations. No
migration hold is needed for this implementation; any future index proposal
requires the separate manager clearance described above. The builder does not
merge or deploy.
