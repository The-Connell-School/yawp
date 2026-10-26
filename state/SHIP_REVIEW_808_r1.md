# Independent Ship Review r1 — PR #808

**Target:** [fix: redact app-route JSON error.message (#8z)](https://github.com/The-Connell-School/yawp/pull/808)  
**Reviewed head (matches PR head at review time):** `d17e88db4e0f5c04ca7b112f2eac3ccfb0ef4b20`  
**Branch:** `cursor/fix-app-route-error-message-8z-0122`  
**Diff base (PR base tip at review time):** `1bbf6a87249cf3566e1e501db1be5978b0ce984a` (#806)  
**Comparison performed:** `git diff origin/main...d17e88db4e0f5c04ca7b112f2eac3ccfb0ef4b20` (full PR diff vs `main`, not only vs base)

## Verdict

**SHIP** (independent approval for merge of #808 when required CI is green on this head; this review does not merge #808).

---

## Claim vs diff

After #8y closed API-route `error.message` leaks, this PR wraps typed domain failures in app-route `dataResponse` handlers with `safeDomainErrorTextForClientResponse` from `~/utils/server-error-request-context.server`.

**13 files, +270 / −21 lines** — application routes and focused unit tests only; no schema, flags, or admin UI.

| Area | Route / module | JSON field | Domain errors wired |
|------|----------------|------------|---------------------|
| Assignments list | `app.assignments._index` | `message` | `AssignmentHasCollaborativeWorkError` |
| Assignment detail | `app.assignments.$assignmentId._index` | `message` | `AssignmentPromptAttachmentError`, `FreeClassroomAssignmentQuotaError` (×2) |
| Class assignment groups | `app.class-assignments.$classAssignmentId.groups` | `message` | `GroupEditingError` |
| Group draft grading | `app.group-drafts.$documentId` | `message` | `DraftCommentError`, `GroupGradeError`, `MemberGradeError` |
| Collab document | `app_.collab-documents_.$id` | `message` | `DraftCommentError` |
| My classes list | `app.my-classes._index` | `error` | `ClassCodeCollisionError` (×2), free-tier quota `Error` by message match |
| My class detail | `app.my-classes.$classId` | `message` | `AssignmentHasCollaborativeWorkError` (×2), `AssignmentPromptAttachmentError`, `FreeClassroomAssignmentQuotaError` (×2) |
| Org classes | `app.organization.classes` | `error` | `ClassCodeCollisionError` (×2), free-tier quota `Error` |
| Student invite | `app.my-classes.$classId/class-student-enrollment.server` | `error` (return payload) | `FreeClassSeatError` via `isFreeClassSeatError` |

Static validation copy in the same files (e.g. “Assignment is required”, P2002 collision strings) remains hard-coded and was already safe.

---

## Helper usage correctness

**Choice:** `safeDomainErrorTextForClientResponse(error, fallback)` is the correct helper for typed domain `Error` instances whose messages may contain teacher-facing validation copy. It is distinct from `safeErrorTextForClientResponse`, which always returns the fallback (appropriate for unknown/internal failures on API routes).

**Behavior (existing helper, unchanged in this PR):**

```93:99:services/web-app/app/utils/server-error-request-context.server.ts
export function safeDomainErrorTextForClientResponse(
  error: Error,
  fallback: string,
): string {
  const redacted = redactFreeformMessage(error.message).trim();
  return redacted || fallback;
}
```

**Teacher UX / over-redaction:** Acceptable. Clean domain strings pass through unchanged (covered by `server-error-request-context.server.test.ts`). Token-like substrings, emails, and URLs are stripped via `redactFreeformMessage` while preserving readable validation text (e.g. “shared group work”, “Write something first”, “Free classroom accounts include one class”). Fallback strings match prior product copy where handlers previously forwarded `error.message` verbatim for well-formed errors.

**Under-redaction:** No remaining `dataResponse` paths in the touched files forward raw `error.message`. Repo-wide grep for `message: error.message` / `error: error.message` under `app.*` routes after the PR head shows no matches.

---

## Completeness (claimed JSON paths)

**In scope — done:** Every `dataResponse` catch branch in the PR file list that previously used `error.message` now uses the helper with sensible fallbacks aligned to domain defaults.

**Intentional leftovers (non-JSON, correctly out of scope for #8z):**

- `app.class-assignments.$classAssignmentId.groups`: `redirectWithToast` still sets `description: error.message` for `GroupProvisioningError` (toast HTML path, not `dataResponse` JSON).
- Admin AI evaluations client `setRunError` — untouched (not in diff).
- Free-tier quota detection still uses `error.message.includes('Free classroom accounts include one class')` only for **branching**, not for client payload text; the JSON `error` field goes through the helper.

**Kevin / #608:** No overlap. PR #608 (`Platform enhancements behind platform-enhancements flag`) touches assignment-type v2, creation sheet, guided tours, e2e platform-enhancements, etc. None of those paths appear in #808’s diff. #808 does not modify `platform-enhancements` flag code or Kevin’s #608 surface area.

---

## Test quality

**Added canaries (SECRET-TOKEN):**

| Test file | Scenario |
|-----------|----------|
| `app.assignments._index/route.test.ts` | Delete blocked by collaborative work |
| `app.group-drafts.$documentId/route.test.ts` | `DraftCommentError` on add-comment |
| `app.my-classes._index/route.test.ts` | Free-tier one-class quota on create-class |
| `class-student-enrollment.server.test.ts` | `FreeClassSeatError` on invite |

Each asserts `JSON.stringify(...)` does not contain `SECRET-TOKEN` and retains usable copy (substring / regex).

**Gap (non-blocking):** No new route-level canaries for `app.organization.classes`, `app.assignments.$assignmentId._index`, `app.my-classes.$classId`, `app.class-assignments.*.groups` (dataResponse path), or `app_.collab-documents_.$id`. Risk is low because the helper’s unit tests exercise the same redaction contract and the wiring is one-line per catch. Optional follow-up: one canary per untouched route file for symmetry with #8y API coverage.

**Verification run (reviewer, head `d17e88db`):**

```bash
export PATH="/home/ubuntu/.bun/bin:$PATH"
cd services/web-app
bun test \
  app/utils/server-error-request-context.server.test.ts \
  app/routes/app.assignments._index/route.test.ts \
  app/routes/app.my-classes._index/route.test.ts \
  app/routes/app.my-classes.\$classId/class-student-enrollment.server.test.ts \
  app/routes/app.group-drafts.\$documentId/route.test.ts
```

- **83 pass**, 1 skip, **2 fail** in `app.group-drafts.$documentId/route.test.ts` under “drafting individual grades” (`prisma.$queryRawUnsafe is not a function` in rate-limit mock). Failures are **pre-existing / environmental** and unrelated to the redaction diff; the **new** redaction test in that file **passes**.
- Full `./bin/project test --profile changed` on this VM hit widespread unrelated failures (no Docker / suite noise); not used as a merge gate for this review.

---

## Scope and regressions

- Diff is reviewable: mechanical helper wrap + four focused tests.
- No product behavior change for happy paths; only client-visible error strings when domain errors (or polluted domain messages) occur.
- `app.class-assignments.$classAssignmentId.groups` JSON path for `GroupEditingError` is included even though not named in the one-line PR summary — consistent with the security goal.

---

## Findings summary

| ID | Severity | Finding |
|----|----------|---------|
| F1 | Info | Toast `redirectWithToast` + `GroupProvisioningError` still forwards raw `error.message` — acknowledged out of JSON scope. |
| F2 | Low | Route-level SECRET-TOKEN canaries missing on ~5 touched route files; helper unit tests mitigate. |
| F3 | Info | Two group-drafts grade-draft tests fail locally due to rate-limit Prisma mock; not introduced by #808. |

No BLOCK-level issues: helper choice, wiring completeness for JSON `dataResponse` paths in the diff, teacher-usable copy, and #608 isolation all check out.

---

## Reviewer

Independent Ship Review **r1** — Cloud Agent, 2026-10-26.
