# Independent Ship Review — Yawp! PR #825 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/825  
**Branch:** `cursor/redact-document-creation-error-toast-1a48`  
**Quality lane:** #8ag  
**Reviewer:** Independent Ship Review (r1)  
**Reviewed at (UTC):** 2026-10-26

## Verdict

**SHIP**

Merge when GitHub CI is green on the reviewed head (see CI note below). This review does not block on in-progress checks.

## Reviewed head

| Field | Value |
|-------|--------|
| **SHA** | `363828142da39fdc6095274994b157000742b403` |
| **GitHub `headRefOid`** | Matches at review time |

## Scope check (diff vs `origin/main`)

- **Files:** 6 (`documents.server.ts` + tests, two assignment-start routes + one route test file, `app.assignment-types.$id` route).
- **Nature:** Error-toast copy safety only — adds `documentCreationErrorTextForClient()` and replaces raw `DocumentCreationError.message` in redirect toasts. No UI redesign, migrations, Terraform, or secrets.
- **Overlap:** No Kevin / #608 / #437 / #459 / #484 / #723 touchpoints in this diff.

## Findings

### Whitelist vs `DocumentCreationError` throw sites

All throws live in `services/web-app/app/domain/documents.server.ts` inside `createDocumentForAssignmentType`. There are **seven** throw sites and **two** intentionally user-safe, static messages:

| Message | Whitelisted | Toast behavior |
|---------|-------------|----------------|
| `AssignmentType is not available.` | Yes | Shown verbatim |
| `No modules for this AssignmentType.` | Yes | Shown verbatim |
| `` `ClassAssignment ${id} not found` `` | No | Generic fallback |
| `ClassAssignment assignment type does not match input.assignmentTypeId` | No | Generic fallback |
| `assignmentId does not match ClassAssignment.assignmentId` | No | Generic fallback |
| `` `Assignment ${id} not found` `` | No | Generic fallback |
| `` `Assignment.assignmentTypeId (${a}) does not match input.assignmentTypeId (${b})` `` | No | Generic fallback |

The whitelist is **complete** for current throw sites: every non-whitelisted message embeds internal IDs and/or field names and must not reach clients. No safe static message is missing from the set.

### Route wiring

Every UI path that caught `DocumentCreationError` and forwarded `creationError.message` into a toast is updated:

- `app.assignments.$assignmentId.start/route.ts` — fallback: `Could not start this assignment.`
- `app.class-assignments.$classAssignmentId.start/route.ts` — same fallback (symmetric behavior).
- `app.assignment-types.$id/route.tsx` — fallback: `Could not create a document. Please try again.`

No other routes import `DocumentCreationError` for toast handling.

### Prisma / non-domain errors

Each route retains `throw creationError` after the `instanceof DocumentCreationError` branch. Database and other failures are **not** wrapped or swallowed.

### Tests

- Unit tests for `documentCreationErrorTextForClient` (whitelist + ID redaction).
- Route tests on assignment start for internal vs user-safe toast copy.
- **Nit (non-blocking):** `app.class-assignments.$classAssignmentId.start` uses the same helper but has no new mirror tests; behavior is identical and covered indirectly via the shared helper + assignment-start route tests.

Local run (reviewed head files): `documents.server.test.ts` and `app.assignments.$assignmentId.start/route.test.ts` — **17 pass, 0 fail**.

### Maintenance

New user-facing `DocumentCreationError` copy must be added to `DOCUMENT_CREATION_USER_SAFE_MESSAGES` or it will silently map to the route fallback. Acceptable for a conservative whitelist; document in code comment is already present.

## CI (head `363828142`)

At review time:

- **Pass:** Changed paths, Preview tooling, preview-policy, **migration-integration** (run `40326437094`).
- **In progress:** Main CI workflow `40326437062` (TypeScript, Prisma migrations job, E2E shards, browser flows).
- **Skipped:** preview-deploy (expected for this change class).

Do not treat in-progress CI alone as a ship block; re-check green on the same head before merge.

## Recommendation

Approve **#825** for merge after green CI on `363828142da39fdc6095274994b157000742b403`. This review does not merge #825.
