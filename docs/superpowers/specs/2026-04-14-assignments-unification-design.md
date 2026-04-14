# Assignments Unification — Data Model Refactor

**Date:** 2026-04-14
**Branch context:** planned on `document-hardening`; intended to ship after `document-hardening` merges to `main`.
**Status:** Design approved, ready for implementation plan.

## Background

yawp-2.0 today has three overlapping template-like models:

- `StudentCourse` — a shared, pre-configured tutor setup (title, description, modules, rubric). Examples: "Five-Paragraph Essay," "Thesis-Driven Essay," "Daily Pages."
- `Assignment` — a per-class instance layered on `StudentCourse`, adding `prompt`, `tutorContext`, `dueDate`, and a `classId`.
- `TeacherCourse` — unrelated in purpose: video/training content *for teachers* (professional development).

Three problems have emerged as the product has grown:

1. **Dual nature of `StudentCourse`.** Some rows are pure templates; others are effectively "the thing a class is doing," with class-specific topics baked in. The model doesn't distinguish.
2. **Ubiquitous-language drift.** Teachers, the business owner, and engineers all use "assignment" casually, but the data model calls the template a "student course" and the instance an "assignment." Conversations are slower because names don't match meaning.
3. **Custom courses are emerging.** Teachers want to bring their own writing courses into yawp and use them as the basis for assignments. `StudentCourse` has no concept of ownership; `TeacherCourse` solves a different problem.

The `ClassStudentCourse` join table (whitelisting which `StudentCourse`s a class can use) adds further complexity without clear benefit in a world where teachers own types and can freely pick from system/org/personal pools.

## Goals

1. Align the data model with real-world language: **AssignmentType** (the template) and **Assignment** (the teacher-created instance).
2. Make the tutor configuration always explicitly attached to a Document.
3. Support teacher-owned custom types alongside system and org-owned types.
4. Remove redundant concepts: `ClassStudentCourse`, `Document.classId`.
5. Rename `TeacherCourse` → `TeacherTraining` for clarity; no structural change.
6. Ship as a single atomic migration — short maintenance window, no backwards compatibility layer.

## Non-Goals

- Per-Assignment module overrides (future work if teachers request it).
- Marketplace / sharing of teacher-owned AssignmentTypes.
- Grading, submission, or document-history changes — owned by the `document-hardening` branch.
- Any changes to the internals of `TeacherTraining` beyond the table rename.

## Ubiquitous Language

- **AssignmentType** — a reusable tutor configuration: title, description, modules, rules, rubric. Replaces `StudentCourse`. Can be system-owned (default), org-owned, or teacher-owned. Examples: "Five-Paragraph Essay," "Thesis-Driven Essay," "Daily Pages," "Free Write."
- **Assignment** — a specific teacher-created instance *for a class*: picks an AssignmentType, adds a `prompt`, a `dueDate`, optional extra tutor context (`tutorContext`). Every Assignment belongs to one Class and references one AssignmentType.
- **AssignmentModule** — a unit of work inside an AssignmentType (tutor instructions, ordering). Replaces `StudentCourseModule`.
- **AssignmentModuleSession** — a student's progress through a module for a specific Document. Replaces `StudentCourseModuleSession`.
- **Document** — a student's writing, always attached to an AssignmentType (required), optionally wrapped in an Assignment (when it's class work).
- **Personal Document** — shorthand: a Document with no Assignment. Student started writing on their own; no teacher involvement, no due date.
- **Free Write** — the system-owned default AssignmentType used as a fallback for personal writing with no stronger tutor direction.
- **TeacherTraining** — unchanged concept (was `TeacherCourse`): video courses *for teachers*, professional development. Renamed for clarity only.

## Design Decisions

### 1. Every Document has an AssignmentType; Assignment is optional.

**Decision:** `Document.assignmentTypeId` is required (NOT NULL). `Document.assignmentId` is optional.

**Rationale:**
- The tutor is always configured by the type — one code path.
- "Assignment" in natural language carries teacher/class/graded/due connotations. Using it for personal writing pollutes teacher-facing queries and UI.
- Personal writing ≠ class work. Keeping them separated at the schema level avoids `WHERE kind != 'personal'` filtering everywhere.

### 2. AssignmentType has a nullable owner pair, not polymorphic.

**Decision:** `AssignmentType` has `ownerOrgId` (nullable FK Organization) and `ownerTeacherId` (nullable FK Profile). A CHECK constraint enforces at most one non-null. Both-null means system-owned.

**Rationale:**
- Flat list of types with an optional owner hierarchy matches the real domain.
- Avoids polymorphic-FK joins in every query.
- Visibility query: `WHERE ownerOrgId IS NULL AND ownerTeacherId IS NULL` (system) `OR ownerOrgId = ?` (my org) `OR ownerTeacherId = ?` (my own).

### 3. Assignments are always class-scoped.

**Decision:** `Assignment.classId` is required (NOT NULL). There is no such thing as a "personal assignment."

**Rationale:**
- Personal writing is modeled by a Document with no Assignment.
- Keeps Assignment semantically clean: it always represents teacher-for-class intent.

### 4. Modules live on AssignmentType only.

**Decision:** `AssignmentModule.assignmentTypeId` is required (NOT NULL). No per-Assignment module overrides.

**Rationale:**
- Teachers wanting different modules create a new AssignmentType.
- Leaves room for per-Assignment overrides later (as a new optional table) without painting into a corner.
- Current nullable FK allows orphaned modules; the refactor drops any orphans and locks it to NOT NULL.

### 5. `ClassStudentCourse` whitelist is deleted.

**Decision:** Drop the `ClassStudentCourse` table entirely.

**Rationale:**
- In a world where teachers own their own types and can see `{system} ∪ {org} ∪ {mine}`, a class-level whitelist is noise.
- If a marketplace/sharing model emerges later, it will have its own structure.

### 6. `Document.classId` is deleted.

**Decision:** Drop the `Document.classId` column.

**Rationale:**
- Redundant for class work: `Document → Assignment → Class` provides it.
- Semantically wrong for personal work: journaling isn't "in" a class — the student is in a class, and their journal is theirs.
- Teacher "find student personal writing" query works via `profileId IN (class roster) AND assignmentId IS NULL`.

### 7. `Assignment.tutorContext` stays on Assignment.

**Decision:** Per-class tutor context remains an Assignment field, not an AssignmentType field.

**Rationale:**
- It's per-class customization layered on top of the type.

### 8. `TeacherCourse` renamed to `TeacherTraining`; no structural change.

**Decision:** Rename table only. Internals untouched.

**Rationale:**
- Clarifies it's PD/video content, not a writing template.
- In scope because we're already renaming adjacent tables; trivial to include.

## Target Schema

```
AssignmentType   (was StudentCourse)
  id, createdAt, updatedAt
  title, description, position, imageId
  ownerOrgId       FK Organization, nullable
  ownerTeacherId   FK Profile, nullable
  CHECK (ownerOrgId IS NULL OR ownerTeacherId IS NULL)
  -- NULL/NULL means system-owned
  relations:
    modules (1:many AssignmentModule)
    assignments (1:many Assignment)
    documents (1:many Document)

AssignmentModule   (was StudentCourseModule)
  id, createdAt, updatedAt, deletedAt
  title, description, position, tutorInstructions, isSelfGuided
  assignmentTypeId FK AssignmentType, NOT NULL   -- was nullable
  relations: instructions, sessions

Assignment   (unchanged role, column rename)
  id, createdAt, updatedAt
  classId          FK Class, NOT NULL
  assignmentTypeId FK AssignmentType, NOT NULL   -- was studentCourseId
  title, prompt, tutorContext, dueDate
  relations: documents (1:many Document)

Document
  id, createdAt, updatedAt, revision, deletedAt, archivedAt
  title, text, html
  profileId         FK Profile, NOT NULL
  assignmentTypeId  FK AssignmentType, NOT NULL   -- NEW
  assignmentId      FK Assignment, nullable        -- unchanged; null = personal
  -- classId REMOVED
  relations: sessions, comments, writeJournals, pasteAlerts, revisions, submissions

AssignmentModuleSession   (was StudentCourseModuleSession)
  (column rename: studentCourseModuleId → assignmentModuleId; otherwise unchanged)

AssignmentTypeImage   (was StudentCourseImage; rename only)

TeacherTraining   (was TeacherCourse; rename only, no column changes)

-- DELETED: ClassStudentCourse
```

### Invariants

1. Every Document has an AssignmentType (tutor always knows how to behave).
2. An Assignment without a Class is impossible.
3. If `Document.assignmentId` is set, `Document.assignmentTypeId` must equal `Assignment.assignmentTypeId`. Enforced at the app layer (validated on write); optionally backed by a DB trigger if we want belt-and-suspenders.
4. `AssignmentType` has at most one non-null owner field.

## Renames Summary

### Table-level
| Old | New |
|---|---|
| `StudentCourse` | `AssignmentType` |
| `StudentCourseModule` | `AssignmentModule` |
| `StudentCourseModuleSession` | `AssignmentModuleSession` |
| `StudentCourseImage` | `AssignmentTypeImage` |
| `TeacherCourse` | `TeacherTraining` |

### Column-level
| Table | Old column | New column |
|---|---|---|
| `Assignment` | `studentCourseId` | `assignmentTypeId` |
| `AssignmentModule` | `studentCourseId` | `assignmentTypeId` (and NOT NULL) |
| `AssignmentModuleSession` | `studentCourseModuleId` | `assignmentModuleId` |

### New columns
| Table | Column | Type | Notes |
|---|---|---|---|
| `AssignmentType` | `ownerOrgId` | FK Organization, nullable | NULL = not org-owned |
| `AssignmentType` | `ownerTeacherId` | FK Profile, nullable | NULL = not teacher-owned |
| `Document` | `assignmentTypeId` | FK AssignmentType, NOT NULL | Backfilled, then constrained |

### Deletes
- Table: `ClassStudentCourse`.
- Column: `Document.classId`.

## Code Scope

### In scope
- Prisma schema updated (new names, new columns, dropped tables).
- All references to old names across `services/web-app/app/**`: routes, loaders, actions, components, hooks, services, schemas, tests, i18n strings.
- `createStudentDocumentForCourse` (in `services/web-app/app/domain/student-documents.server.ts`) renamed and adjusted to write `Document.assignmentTypeId`.
- Admin "class-course whitelist" UI removed.
- Teacher Assignment-creation flow: type picker queries `{system} ∪ {my org's} ∪ {my own}` instead of class whitelist.
- Student home: "start writing" defaults to Free Write AssignmentType when no class context is implied.
- E2E tests updated: `assignments-feature-flag.spec.ts`, `student.assignment-start.spec.ts`, any other tests referencing old names.
- `ASSIGNMENTS_ENABLED_ORG_IDS` flag kept as-is — guards teacher Assignment-creation UI only; removed later after full rollout.

### Explicitly out of scope
- Grading/submission logic (`document-hardening` branch owns this).
- Per-Assignment module overrides.
- Marketplace / sharing of custom AssignmentTypes.
- Changes to `TeacherTraining` internals beyond the rename.
- Privacy / visibility controls on personal Documents beyond what exists today.

## Migration Plan

### Approach
One atomic migration, one maintenance window, one deploy. Everything inside a single DB transaction — any failure rolls back cleanly.

### Ordered SQL (inside one Prisma migration file, hand-written)

1. **Seed the Free Write AssignmentType** with a known deterministic ID, minimal tutor config, system-owned.
2. **Rename tables:**
   - `StudentCourse` → `AssignmentType`
   - `StudentCourseModule` → `AssignmentModule`
   - `StudentCourseModuleSession` → `AssignmentModuleSession`
   - `StudentCourseImage` → `AssignmentTypeImage`
   - `TeacherCourse` → `TeacherTraining`
3. **Rename FK columns:**
   - `Assignment.studentCourseId` → `assignmentTypeId`
   - `AssignmentModule.studentCourseId` → `assignmentTypeId`
   - `AssignmentModuleSession.studentCourseModuleId` → `assignmentModuleId`
4. **Add owner columns to `AssignmentType`:** `ownerOrgId`, `ownerTeacherId` (both nullable FKs) + CHECK constraint `(ownerOrgId IS NULL OR ownerTeacherId IS NULL)`.
5. **Delete orphan `AssignmentModule` rows** where `assignmentTypeId IS NULL`, then ALTER to NOT NULL.
6. **Add `Document.assignmentTypeId`** (nullable initially).
7. **Backfill `Document.assignmentTypeId`** in three passes:
   - a. Docs with an Assignment → copy `Assignment.assignmentTypeId`.
   - b. Remaining docs with ≥ 1 `AssignmentModuleSession` → derive from `AssignmentModule.assignmentTypeId` of the earliest-created session for that Document. Before running pass (b), verify in pre-flight that no Document has sessions pointing at multiple distinct types; if any do, investigate before proceeding.
   - c. Remaining docs → point at Free Write.
8. **ALTER `Document.assignmentTypeId` SET NOT NULL.**
9. **Drop `Document.classId`.**
10. **Drop `ClassStudentCourse`** table.

### Pre-flight (before real deploy)
- Run the migration against local dev DB (restored from prod per ongoing practice).
- Verify counts before/after on every renamed table.
- Check pass-7 distribution: how many docs hit (a), (b), (c)? A surprisingly large (c) bucket may indicate misclassified historical work — investigate before proceeding.
- Confirm the `tsc` / `bun run test` suites compile and pass on the updated code.

### Deploy sequence (target: < 30 min)
1. Maintenance page on.
2. `pg_dump` snapshot.
3. Run Prisma migration.
4. Deploy application code.
5. Smoke-test four flows:
   - Teacher creates an Assignment → ok.
   - Student opens a class Assignment doc → tutor loads, modules visible.
   - Student starts personal writing → Document with `assignmentTypeId`, no Assignment.
   - Teacher views class → all class Documents visible.
6. Maintenance page off.

### Rollback
- Migration failure mid-run: transaction rollback (atomic). No partial state possible.
- Post-deploy data issue: restore from `pg_dump` snapshot + revert application code. Plan for this; do not improvise.

### Ordering vs. `document-hardening`
**Recommended:** merge `document-hardening` to `main` first, then do this refactor on a clean base. `document-hardening` deletes `Grade`, `DocumentVersion`, `DocumentSnapshot` and adds `Submission`; this refactor doesn't touch those. Sequencing them separately keeps each diff reviewable and isolates risk.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Prisma auto-generated rename SQL can drop+recreate instead of rename, losing data | Hand-write the migration SQL; do not rely on `prisma migrate dev` to generate renames; verify the generated file before committing |
| CHECK constraints aren't first-class in Prisma schema | Apply CHECK via raw SQL in the migration; add app-layer validation as well |
| Pass-7c bucket larger than expected (many "orphan" Documents) | Run pre-flight against local-prod-restore; investigate before real deploy if the count is material |
| Forgotten old-name references in string literals, i18n, tests | `tsc` catches most; grep for `studentCourse`, `StudentCourse`, `teacherCourse`, `classStudentCourse`, `classId` (on Document) post-rename |
| Migration takes longer than the maintenance window | Pre-test on local dev DB; row counts are small (hundreds of thousands max); if too slow, add indexes before the backfill |
| Rollback needed after deploy reveals bad data | Snapshot before migration; have a practiced restore path |

## Open Questions

None blocking. Items intentionally deferred:
- Exact name for the Free Write AssignmentType's tutor configuration (UX call, not schema-blocking).
- Whether to enforce invariant #3 (Document's Assignment matches its AssignmentType) via DB trigger or just app layer — decide in the implementation plan.
- Final name for the renamed `createStudentDocumentForCourse` function — decide in the implementation plan.
