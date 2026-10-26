# Independent Ship Review r2 — PR #808

**Target:** [fix: redact app-route JSON error.message (#8z)](https://github.com/The-Connell-School/yawp/pull/808)  
**Reviewed head (matches PR head at review time):** `d34c7c28ee7111107736cdfe1090d57b9efacb6d`  
**Prior r1 head (SHIP, superseded for CI only):** `d17e88db4e0f5c04ca7b112f2eac3ccfb0ef4b20`  
**Branch:** `cursor/fix-app-route-error-message-8z-0122`  
**Diff base (PR base tip):** `1bbf6a87249cf3566e1e501db1be5978b0ce984a` (#806 / #8y)  
**Comparison performed:** `git diff origin/main...d34c7c28ee7111107736cdfe1090d57b9efacb6d` (full PR diff vs `main`, not only vs base or vs r1)

## Verdict

**SHIP** (independent approval for merge of #808 when required CI is green on this head; this review does not merge #808).

---

## Delta since r1

r1 SHIPed production wiring at `d17e88db`. CI **TypeScript** then failed on the new assignments-list redaction canary with **TS2352** (unsafe cast from the route `action` return type to `{ init?; data? }`).

Commit `d34c7c28` (`fix(test): cast assignments redaction canary through unknown`) adjusts **only** `services/web-app/app/routes/app.assignments._index/route.test.ts`:

- Avoid asserting a single narrowed type on the full `action()` result.
- Serialize via `(response as { data: unknown }).data` and read `message` through `(response as unknown as { data: { message: string } })`, matching the pattern used in `api.domain.assignment-type-evaluations/route.test.ts` (#8y).

**Production route code is unchanged** from the r1 SHIP commit.

---

## TS2352 resolution

| Check | Result |
|-------|--------|
| Local `react-router typegen && tsc` on head `d34c7c28` | **Pass** (`NODE_OPTIONS=--max-old-space-size=8192`) |
| r1 failure mode (direct cast on `action()` return) | **Removed** in r2 test-only diff |
| Cast pattern vs #8y API canaries | **Aligned** (`unknown` bridge for `.data.message`) |

The fix is sound: tests still assert status 409, no `SECRET-TOKEN` in serialized JSON, and usable copy containing `shared group work`.

---

## Claim vs diff (full PR, unchanged from r1 production scope)

After #8y closed API-route `error.message` leaks, this PR wraps typed domain failures in app-route `dataResponse` handlers with `safeDomainErrorTextForClientResponse` from `~/utils/server-error-request-context.server`.

**13 files, +274 / −21 lines** — application routes and focused unit tests only; no schema, flags, or admin UI.

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

Static validation copy in the same files remains hard-coded and was already safe.

---

## Helper usage correctness

Unchanged from r1: `safeDomainErrorTextForClientResponse(error, fallback)` is correct for typed domain errors whose messages may include teacher-facing validation copy.

Repo-wide grep on head `d34c7c28` for `message: error.message` / `error: error.message` under `app/routes/**`: **no matches**.

**Intentional non-JSON leftovers (still out of scope for #8z):**

- `app.class-assignments.$classAssignmentId.groups`: `redirectWithToast` still sets `description: error.message` for `GroupProvisioningError`.
- Admin AI evaluations client `setRunError` — untouched.
- Free-tier quota branching still uses `error.message.includes(...)` for control flow only; JSON payloads use the helper.

**Kevin / #608:** No overlap. #808 does not touch platform-enhancements, assignment-type v2, or other #608 surfaces.

---

## Prior r1 findings — still hold

| ID | Severity | r1 finding | r2 status |
|----|----------|------------|-----------|
| F1 | Info | Toast `GroupProvisioningError` raw `error.message` | Unchanged, acknowledged |
| F2 | Low | Missing SECRET-TOKEN canaries on ~5 route files | Unchanged; helper unit tests mitigate |
| F3 | Info | Two group-drafts grade-draft tests fail on Prisma rate-limit mock | Still pre-existing; **new** redaction test passes |

No new BLOCK-level issues introduced by the r2 test cast fix.

---

## Test quality and verification (reviewer, head `d34c7c28`)

```bash
export PATH="/home/ubuntu/.bun/bin:$PATH"
cd services/web-app
NODE_OPTIONS="--max-old-space-size=8192" bun run typecheck

bun test \
  app/utils/server-error-request-context.server.test.ts \
  app/routes/app.assignments._index/route.test.ts \
  app/routes/app.my-classes._index/route.test.ts \
  app/routes/app.my-classes.\$classId/class-student-enrollment.server.test.ts \
  app/routes/app.group-drafts.\$documentId/route.test.ts
```

- **Typecheck:** pass on reviewed head.
- **83 pass**, 1 skip, **2 fail** in `app.group-drafts.$documentId/route.test.ts` under “drafting individual grades” (rate-limit / `$queryRawUnsafe` mock — same as r1, unrelated to redaction).
- Assignments-list **redaction canary passes** with the r2 cast pattern.

---

## Scope and regressions

- r2 adds zero production diff; security and UX conclusions from r1 remain valid.
- No product behavior change on happy paths.

---

## Reviewer

Independent Ship Review **r2** — Cloud Agent, 2026-10-26.

**Related:** r1 artifact in PR #809 (`state/SHIP_REVIEW_808_r1.md` @ `d17e88db`) — leave #809 as historical r1; this file is the r2 record for head `d34c7c28`.
