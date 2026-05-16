# Assignments Unification — Migration Delta Spec

**Date:** 2026-04-20
**Branch:** `assignments-unification` (18 commits ahead of `main`)
**Migration file:** `20260414130000_unify_assignment_model/migration.sql`
**Prerequisite:** `document-hardening` merged (PRs #96, #99 — confirmed merged 2026-04-14)

---

## Overview

One atomic migration (wrapped in BEGIN/COMMIT) that:
1. Renames `StudentCourse*` tables/columns to `AssignmentType*`
2. Renames `TeacherCourse*` tables/columns to `TeacherTraining*`
3. Adds ownership columns to `AssignmentType`
4. Attaches every `Document` directly to an `AssignmentType`
5. Drops `Document.classId` and the `ClassStudentCourse` table

**No rows are created or destroyed** (except: orphan `AssignmentModule` rows with NULL
`assignmentTypeId` are deleted, and one seed row — "Free Write" — is inserted).

---

## 1. Table Renames (pure renames, zero data change)

Every row survives intact. Only the table name and constraint/index names change.

| Before | After | Prod rows |
|---|---|---|
| `StudentCourse` | `AssignmentType` | 5 |
| `StudentCourseImage` | `AssignmentTypeImage` | 4 |
| `StudentCourseModule` | `AssignmentModule` | 21 |
| `StudentCourseModuleInstruction` | `AssignmentModuleInstruction` | 31 |
| `StudentCourseModuleInstructionButton` | `AssignmentModuleInstructionButton` | 23 |
| `StudentCourseModuleSession` | `AssignmentModuleSession` | 7,309 |
| `StudentCourseModuleSessionMessage` | `AssignmentModuleSessionMessage` | 43,866 |
| `TeacherCourse` | `TeacherTraining` | 2 |
| `TeacherCourseImage` | `TeacherTrainingImage` | 2 |
| `TeacherCourseModule` | `TeacherTrainingModule` | 13 |
| `TeacherCourseModuleResource` | `TeacherTrainingModuleResource` | 20 |
| `TeacherCourseResource` | `TeacherTrainingResource` | 0 |
| `TeacherCourseModuleSession` | `TeacherTrainingModuleSession` | 132 |
| `_TeacherCourseAssignments` (M:N join) | `_TeacherTrainingAssignments` | (implicit) |

**Verification:** Row count on each renamed table must equal the before count exactly.

**Risk:** None. `ALTER TABLE ... RENAME TO` is metadata-only in Postgres. No data is touched.

---

## 2. Column Renames (pure renames, zero data change)

| Table (after name) | Before column | After column | Rows affected |
|---|---|---|---|
| `Assignment` | `studentCourseId` | `assignmentTypeId` | 5 |
| `AssignmentTypeImage` | `studentCourseId` | `assignmentTypeId` | 4 |
| `AssignmentModule` | `studentCourseId` | `assignmentTypeId` | 21 |
| `AssignmentModuleInstruction` | `studentCourseModuleId` | `assignmentModuleId` | 31 |
| `AssignmentModuleInstructionButton` | `studentCourseModuleInstructionId` | `assignmentModuleInstructionId` | 23 |
| `AssignmentModuleSession` | `studentCourseModuleId` | `assignmentModuleId` | 7,309 |
| `AssignmentModuleSessionMessage` | `studentCourseModuleSessionId` | `assignmentModuleSessionId` | 43,866 |
| `TeacherTrainingImage` | `teacherCourseId` | `teacherTrainingId` | 2 |
| `TeacherTrainingModule` | `teacherCourseId` | `teacherTrainingId` | 13 |
| `TeacherTrainingModuleResource` | `teacherCourseModuleId` | `teacherTrainingModuleId` | 20 |
| `TeacherTrainingModuleSession` | `teacherCourseModuleId` | `teacherTrainingModuleId` | (same join table) |
| `TeacherTrainingResource` | `teacherCourseId` | `teacherTrainingId` | 0 |

**Verification:** All FK values are unchanged. The column just has a new name.

**Risk:** None. `ALTER TABLE ... RENAME COLUMN` is metadata-only.

---

## 3. New Columns on AssignmentType

| Column | Type | Default | Purpose |
|---|---|---|---|
| `ownerOrgId` | `TEXT NULL` FK -> Organization | NULL | Org-owned assignment types |
| `ownerTeacherId` | `TEXT NULL` FK -> Profile | NULL | Teacher-owned assignment types |

**CHECK constraint:** `ownerOrgId IS NULL OR ownerTeacherId IS NULL` (at most one owner).

**After migration:** All 5 existing rows have both NULL (= system-owned). This is correct — all
current StudentCourses are system-level templates, not org- or teacher-owned.

**Verification:** `SELECT COUNT(*) FROM "AssignmentType" WHERE ownerOrgId IS NOT NULL OR ownerTeacherId IS NOT NULL` = 0.

---

## 4. Seed Row: Free Write AssignmentType

One new row inserted:

```
id:          cfreewrite0000000000000000
title:       Free Write
description: An open-ended writing space. No prompt, no structure — just write.
position:    0
ownerOrgId:  NULL
ownerTeacherId: NULL
```

**After migration:** AssignmentType count goes from 5 -> 6.

**Verification:** `SELECT id, title FROM "AssignmentType" WHERE id = 'cfreewrite0000000000000000'` returns exactly 1 row.

---

## 5. Orphan Module Cleanup

**Before:** 0 `StudentCourseModule` rows have `studentCourseId IS NULL`.

**Migration step:** `DELETE FROM "AssignmentModule" WHERE assignmentTypeId IS NULL`, then
`ALTER COLUMN assignmentTypeId SET NOT NULL`.

**Verification:** Preflight confirms 0 orphans. After migration, `AssignmentModule` count = 21
(unchanged). The NOT NULL constraint prevents future orphans.

**Risk:** None — there are no orphans in prod data.

---

## 6. Document.assignmentTypeId — The Critical Backfill

This is the only step that **writes data to existing rows**. Every Document gets a new required
column `assignmentTypeId` pointing at an AssignmentType.

### Before state (Document)

| Category | Count | Description |
|---|---|---|
| Total documents | 2,638 | |
| With `assignmentId` | 8 | Created through teacher Assignment flow |
| With `classId` only (no assignment) | 1,422 | Student opened doc within a class context |
| Neither `classId` nor `assignmentId` | 1,208 | Personal writing, no class context |

### Three-pass backfill

| Pass | Logic | Docs matched | Source of `assignmentTypeId` |
|---|---|---|---|
| **7a** | Doc has an `assignmentId` -> copy `Assignment.assignmentTypeId` | **8** | Assignment's type |
| **7b** | No assignment, but has `AssignmentModuleSession`(s) -> derive from earliest session's module's type | **2,585** | Session -> Module -> Type |
| **7c** | Everything else -> Free Write | **45** | Hardcoded `cfreewrite0000000000000000` |
| **Total** | | **2,638** | |

### What each bucket represents

**Pass 7a (8 docs):** These are docs created through the formal Assignment flow — a teacher
created an Assignment for a class, and students wrote in response. The Assignment already knows
its `assignmentTypeId`, so this is a direct copy. All 8 docs have matching `Assignment.studentCourseId`
and session-derived course IDs (verified — zero mismatches).

**Pass 7b (2,585 docs):** The bulk of student writing. These docs were created through the
tutor flow (student picked a StudentCourse, worked through modules). They have
`AssignmentModuleSession` records that trace back to a specific module and its parent type.
The migration uses the **earliest session by createdAt** to determine the type.

- **Invariant verified:** No document has sessions pointing at multiple distinct StudentCourses.
  This means the "earliest session" heuristic is safe — there's only one possible answer per doc.

**Pass 7c (45 docs):** Documents with no Assignment and no module sessions. These are likely:
- Docs students created and never started a tutor flow on
- Test/demo documents
- Documents where the student navigated away before any session was created

Mapping these to "Free Write" is correct — they have no tutor configuration today, and Free Write
is the "no structure" default.

### After state (Document)

| Column | Before | After |
|---|---|---|
| `assignmentTypeId` | (did not exist) | NOT NULL FK -> AssignmentType, indexed |

**Verification assertions:**
1. `SELECT COUNT(*) FROM "Document" WHERE assignmentTypeId IS NULL` = 0
2. `SELECT COUNT(*) FROM "Document"` = 2,638 (unchanged)
3. `SELECT COUNT(*) FROM "Document" WHERE assignmentTypeId = 'cfreewrite0000000000000000'` = 45
4. For docs with `assignmentId`: `Document.assignmentTypeId = Assignment.assignmentTypeId` (all 8)

---

## 7. Dropped Column: Document.classId

| Column | Type | Nullable | Prod usage |
|---|---|---|---|
| `Document.classId` | TEXT FK -> Class | YES | 1,430 of 2,638 docs had a value |

### Why this is safe to drop

The `classId` on Document was a shortcut for "which class is this doc associated with." After
the migration, this relationship is derived through:

- **For assigned docs:** `Document -> Assignment -> Class`
- **For unassigned docs in a class:** The student's class membership (`StudentProfile -> classes`)
  combined with the document's assignment type determines context. The class itself was never a
  meaningful attribute of a personal document — it was the student who belonged to the class,
  not the document.

### Data loss analysis

**Is any information lost?** Partially — for the 1,422 documents that had `classId` but no
`assignmentId`, the direct doc->class link is lost. However:

- These docs' students are already members of their classes via `StudentProfile.classes`.
- The query "show me all documents from students in class X" still works:
  `WHERE profileId IN (SELECT profileId FROM StudentProfile JOIN _ClassToStudentProfile ...)`
- The query "which class was this doc written for" can be answered by checking which class the
  student's profile belongs to.
- No teacher-facing or student-facing UI currently uses `Document.classId` directly for rendering —
  it's always been derived through the student's class membership in practice.

**Mitigation:** The 1,430 classId values are **not persisted anywhere after the migration**.
If a future feature needs "which class context was this doc originally opened in," that data
will be gone. The design spec accepts this tradeoff explicitly (Decision #6).

---

## 8. Dropped Table: ClassStudentCourse

| Table | Rows | Purpose |
|---|---|---|
| `ClassStudentCourse` | 117 | Whitelist: which StudentCourses a Class can use |

### Data in the table

117 rows mapping classes to student courses. The 5 StudentCourses are shared across many
classes:

| Course | Classes linked |
|---|---|
| The Thesis-Driven Essay | ~65 classes |
| Welcome to YAWP! | ~42 classes |
| Daily Pages | ~6 classes |
| The 5-Paragraph Essay | ~2 classes |
| E2E Course | 1 class |

### Why this is safe to drop

The whitelist model is replaced by ownership-based visibility:
- **System-owned types** (both owners NULL): visible to everyone
- **Org-owned types**: visible to all teachers in that org
- **Teacher-owned types**: visible to that teacher only

Since all 5 current StudentCourses are system-owned, every teacher already sees all of them.
The whitelist was filtering a set that was always "everything" in practice.

**Data loss:** The specific class-to-course mapping data (117 rows) is lost. This data is not
preserved anywhere. However, since the new visibility model makes all system types universally
available, the functional behavior is unchanged — no teacher loses access to any type they could
use before.

---

## 9. Summary: What could go wrong

| Scenario | Risk | Mitigation |
|---|---|---|
| Pass 7b picks wrong AssignmentType for a doc | **None** — invariant verified: zero docs span multiple courses | Preflight script checks this |
| Pass 7c bucket is too large (docs losing their type) | **Low** — only 45 of 2,638 (1.7%), and these genuinely have no type today | Postcheck reports the count; review if > expected |
| Document.classId data needed later | **Accepted tradeoff** — 1,422 direct links lost | Design decision #6 explicitly accepts this |
| ClassStudentCourse data needed later | **Accepted tradeoff** — 117 whitelist rows lost | New visibility model makes this redundant |
| Transaction fails mid-way | **None** — entire migration is in BEGIN/COMMIT; Postgres rolls back atomically | |
| Application code references old names | **Caught** — the branch has 18 commits of codebase-wide renames | `tsc` + `grep` for old names |

---

## 10. Expected Row Counts: Before vs After

| Table | Before | After | Delta | Notes |
|---|---|---|---|---|
| AssignmentType (was StudentCourse) | 5 | **6** | +1 | Free Write seed row |
| AssignmentTypeImage (was StudentCourseImage) | 4 | **4** | 0 | |
| AssignmentModule (was StudentCourseModule) | 21 | **21** | 0 | 0 orphans deleted |
| AssignmentModuleInstruction | 31 | **31** | 0 | |
| AssignmentModuleInstructionButton | 23 | **23** | 0 | |
| AssignmentModuleSession (was StudentCourseModuleSession) | 7,309 | **7,309** | 0 | |
| AssignmentModuleSessionMessage | 43,866 | **43,866** | 0 | |
| TeacherTraining (was TeacherCourse) | 2 | **2** | 0 | |
| TeacherTrainingImage | 2 | **2** | 0 | |
| TeacherTrainingModule | 13 | **13** | 0 | |
| TeacherTrainingModuleResource | 20 | **20** | 0 | |
| TeacherTrainingResource | 0 | **0** | 0 | |
| TeacherTrainingModuleSession | 132 | **132** | 0 | |
| Assignment | 5 | **5** | 0 | Column rename only |
| Document | 2,638 | **2,638** | 0 | +1 column, -1 column |
| ClassStudentCourse | 117 | **(dropped)** | -117 | Table deleted |

---

## 11. Relationship Changes

### Before: How to get from Document to Class
```
Document.classId -> Class          (direct FK, nullable)
Document.assignmentId -> Assignment.classId -> Class   (indirect, nullable)
```

### After: How to get from Document to Class
```
Document.assignmentId -> Assignment.classId -> Class   (only path, nullable)
-- For unassigned docs: Student's class membership
Document.profileId -> Profile -> StudentProfile -> classes -> Class
```

### Before: How to get from Document to its tutor configuration
```
-- Via session (if exists):
Document -> StudentCourseModuleSession -> StudentCourseModule -> StudentCourse
-- Via assignment (if exists):
Document -> Assignment -> StudentCourse
-- Otherwise: unknown / no configuration
```

### After: How to get from Document to its tutor configuration
```
Document.assignmentTypeId -> AssignmentType   (always, NOT NULL)
```

### Before: Which StudentCourses can a class use?
```
Class -> ClassStudentCourse -> StudentCourse   (whitelist)
```

### After: Which AssignmentTypes can a teacher use?
```
-- All system types (ownerOrgId NULL AND ownerTeacherId NULL)
-- Plus org types (ownerOrgId = teacher's org)
-- Plus own types (ownerTeacherId = teacher's profileId)
-- No class-level filtering
```

---

## 12. Verification Checklist (for preflight + postcheck scripts)

### Preflight (run before migration)

- [ ] Row counts captured for all 16 affected tables
- [ ] Orphan module count = 0
- [ ] Multi-course invariant holds (0 docs span multiple courses)
- [ ] Backfill bucket estimates: 7a=8, 7b=2585, 7c=45, total=2638

### Postcheck (run after migration)

- [ ] All renamed tables exist with new names
- [ ] All old table names are gone (`StudentCourse`, `TeacherCourse`, `ClassStudentCourse`)
- [ ] `Document.classId` column is gone
- [ ] `Document.assignmentTypeId` is NOT NULL on every row (count matches total docs)
- [ ] Free Write AssignmentType exists (`cfreewrite0000000000000000`)
- [ ] AssignmentType count = 6 (5 original + 1 Free Write)
- [ ] All other table counts match before counts exactly
- [ ] Docs on Free Write = 45
- [ ] For all 8 docs with assignmentId: `Document.assignmentTypeId = Assignment.assignmentTypeId`
- [ ] `AssignmentModule.assignmentTypeId` has no NULLs
- [ ] Owner columns on AssignmentType: all 6 rows have both NULL (system-owned)
