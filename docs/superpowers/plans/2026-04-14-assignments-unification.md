# Assignments Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `StudentCourse` → `AssignmentType`, make `Document.assignmentTypeId` required, add owner columns on AssignmentType, drop `ClassStudentCourse` and `Document.classId`, rename `TeacherCourse` → `TeacherTraining`. One atomic migration, one deploy.

**Architecture:** Hand-written Prisma migration (the auto-generator mangles renames). Schema change + every code reference updates together. Codebase will not fully compile during intermediate commits on this branch — the final task verifies full compilation and runs the whole suite. Acceptable because the entire refactor ships as a single branch merge + single deploy.

**Tech Stack:** Prisma + Postgres, React Router 7 (loader/action routes), bun:test, Playwright (e2e), TypeScript strict.

**Branch:** `assignments-unification` (already created, spec committed).

**Reference spec:** `docs/superpowers/specs/2026-04-14-assignments-unification-design.md`.

---

## File Structure

### Schema / migrations
- **Create:** `packages/prisma/migrations/<timestamp>_unify_assignment_model/migration.sql`
- **Modify:** `packages/prisma/schema.prisma` — renames + new columns + drops
- **Create:** `services/web-app/app/utils/assignment-types.ts` — exports `FREE_WRITE_ASSIGNMENT_TYPE_ID` constant

### Domain
- **Modify/Rename:** `services/web-app/app/domain/student-documents.server.ts` → `services/web-app/app/domain/documents.server.ts` — rename `createStudentDocumentForCourse` → `createDocumentForAssignmentType`, update to write `assignmentTypeId`

### Routes
- **Rename directory:** `app/routes/app.admin.student-courses._index` → `app/routes/app.admin.assignment-types._index`
- **Rename directory:** `app/routes/app.admin.student-courses.$id` → `app/routes/app.admin.assignment-types.$id`
- **Rename directory:** `app/routes/app.admin.student-courses.$id_.modules_.$moduleId` → `app/routes/app.admin.assignment-types.$id_.modules_.$moduleId`
- **Modify:** `app/routes/app.assignments.$assignmentId.start/route.ts` — use new field names
- **Modify:** `app/routes/app._index/route.tsx` — scope type picker to `{system} ∪ {my org} ∪ {mine}`, default new docs to Free Write
- **Modify:** `app/routes/app.my-classes.$classId/route.tsx` and `assignment-sheet.tsx` — type picker from owner-scoped set
- **Modify:** `app/routes/app.organization.classes/route.tsx` — delete ClassStudentCourse whitelist UI
- **Modify:** `app/routes/app.courses.$id/route.tsx` — rename to `app.assignment-types.$id` (consider as part of Task 7)
- **Modify:** `app/routes/app_.documents_.$id/route.tsx` and editor.tsx — update references
- **Modify:** `app/routes/api.model.course-module-session/route.ts` — rename path and references

### Tests
- **Modify:** `services/web-app/e2e/tests/assignments-feature-flag.spec.ts`
- **Modify:** `services/web-app/e2e/tests/student.assignment-start.spec.ts`
- **Modify:** `services/web-app/e2e/tests/student.graded-feedback.spec.ts` (if references StudentCourse)
- **Modify:** Any other tests referencing old names — found via Task 11 grep.

---

## Task 1: Baseline local dev DB + migration preflight assertions

**Files:**
- Create: `packages/prisma/scripts/assignments-unification-preflight.ts`

**Purpose:** Before writing the migration, capture current row counts and verify pass-7b assumption (no Document has sessions pointing at multiple distinct AssignmentTypes).

- [ ] **Step 1: Write the preflight script**

Create `packages/prisma/scripts/assignments-unification-preflight.ts`:

```typescript
import { PrismaClient } from "../generated";

const prisma = new PrismaClient();

async function main() {
  const counts = {
    studentCourses: await prisma.studentCourse.count(),
    assignments: await prisma.assignment.count(),
    studentCourseModules: await prisma.studentCourseModule.count(),
    orphanModules: await prisma.studentCourseModule.count({
      where: { studentCourseId: null },
    }),
    studentCourseModuleSessions: await prisma.studentCourseModuleSession.count(),
    documents: await prisma.document.count(),
    documentsWithAssignment: await prisma.document.count({
      where: { assignmentId: { not: null } },
    }),
    documentsWithoutAssignment: await prisma.document.count({
      where: { assignmentId: null },
    }),
    teacherCourses: await prisma.teacherCourse.count(),
    classStudentCourses: await prisma.classStudentCourse.count(),
  };

  console.log("Row counts:", counts);

  // Verify invariant: no Document has sessions pointing at > 1 distinct StudentCourse
  const conflictRows = await prisma.$queryRaw<Array<{ documentId: string; distinctCourses: bigint }>>`
    SELECT s."documentId", COUNT(DISTINCT m."studentCourseId") AS "distinctCourses"
    FROM "StudentCourseModuleSession" s
    JOIN "StudentCourseModule" m ON m.id = s."studentCourseModuleId"
    GROUP BY s."documentId"
    HAVING COUNT(DISTINCT m."studentCourseId") > 1
  `;

  if (conflictRows.length > 0) {
    console.error(
      `FAIL: ${conflictRows.length} Documents have sessions pointing at multiple StudentCourses. Investigate before migration.`
    );
    console.error(conflictRows.slice(0, 20));
    process.exit(1);
  }

  console.log("OK: pass-7b invariant holds (no Document spans multiple courses).");

  // Estimate pass 7 buckets
  const docsWithAssignment = counts.documentsWithAssignment;
  const docsWithoutAssignmentWithSessions = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT d.id) AS count
    FROM "Document" d
    WHERE d."assignmentId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "StudentCourseModuleSession" s WHERE s."documentId" = d.id
      )
  `;
  const pass7b = Number(docsWithoutAssignmentWithSessions[0]!.count);
  const pass7c = counts.documents - docsWithAssignment - pass7b;

  console.log("Backfill distribution:");
  console.log(`  pass 7a (via Assignment): ${docsWithAssignment}`);
  console.log(`  pass 7b (via ModuleSession): ${pass7b}`);
  console.log(`  pass 7c (Free Write fallback): ${pass7c}`);

  if (pass7c > docsWithAssignment) {
    console.warn(
      `WARN: more docs fall back to Free Write (${pass7c}) than have an Assignment (${docsWithAssignment}). Investigate before migration.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the preflight script**

Run: `cd packages/prisma && bun run scripts/assignments-unification-preflight.ts`
Expected: row counts printed; `OK: pass-7b invariant holds` or `FAIL` with rows to investigate.

If FAIL: STOP. Investigate the conflicting documents before proceeding. Those rows need a deterministic tie-break rule that the migration author agrees with.

If pass7c is larger than expected: investigate those documents manually before committing to the migration.

- [ ] **Step 3: Commit**

```bash
git add packages/prisma/scripts/assignments-unification-preflight.ts
git commit -m "chore: add preflight script for assignments unification migration"
```

---

## Task 2: Add `FREE_WRITE_ASSIGNMENT_TYPE_ID` constant

**Files:**
- Create: `services/web-app/app/utils/assignment-types.ts`

- [ ] **Step 1: Create the constant file**

Create `services/web-app/app/utils/assignment-types.ts`:

```typescript
/**
 * Deterministic ID for the system-owned "Free Write" AssignmentType.
 * Used when a Document has no stronger tutor direction (personal writing,
 * migration fallback).
 */
export const FREE_WRITE_ASSIGNMENT_TYPE_ID = "cfreewrite0000000000000000";
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/app/utils/assignment-types.ts
git commit -m "feat: add FREE_WRITE_ASSIGNMENT_TYPE_ID constant"
```

---

## Task 3: Write the migration SQL

**Files:**
- Create: `packages/prisma/migrations/<timestamp>_unify_assignment_model/migration.sql`

**Purpose:** Hand-write the SQL so Prisma doesn't drop+recreate tables (which would lose data).

- [ ] **Step 1: Create the migration directory**

Pick a timestamp in the format `YYYYMMDDHHMMSS`. Use today (2026-04-14) with a time after the most recent migration (`20260414120000_submission_archived_at`).

Run:
```bash
mkdir -p packages/prisma/migrations/20260414130000_unify_assignment_model
```

- [ ] **Step 2: Write the migration SQL**

Create `packages/prisma/migrations/20260414130000_unify_assignment_model/migration.sql`:

```sql
-- Assignments Unification Migration
-- See docs/superpowers/specs/2026-04-14-assignments-unification-design.md

BEGIN;

-- =========================================================================
-- Step 1: Rename tables
-- =========================================================================
ALTER TABLE "StudentCourse" RENAME TO "AssignmentType";
ALTER TABLE "StudentCourseImage" RENAME TO "AssignmentTypeImage";
ALTER TABLE "StudentCourseModule" RENAME TO "AssignmentModule";
ALTER TABLE "StudentCourseModuleInstruction" RENAME TO "AssignmentModuleInstruction";
ALTER TABLE "StudentCourseModuleInstructionButton" RENAME TO "AssignmentModuleInstructionButton";
ALTER TABLE "StudentCourseModuleSession" RENAME TO "AssignmentModuleSession";
ALTER TABLE "StudentCourseModuleSessionMessage" RENAME TO "AssignmentModuleSessionMessage";
ALTER TABLE "TeacherCourse" RENAME TO "TeacherTraining";
ALTER TABLE "TeacherCourseImage" RENAME TO "TeacherTrainingImage";
ALTER TABLE "TeacherCourseModule" RENAME TO "TeacherTrainingModule";
ALTER TABLE "TeacherCourseModuleResource" RENAME TO "TeacherTrainingModuleResource";
ALTER TABLE "TeacherCourseResource" RENAME TO "TeacherTrainingResource";
ALTER TABLE "TeacherCourseModuleSession" RENAME TO "TeacherTrainingModuleSession";

-- =========================================================================
-- Step 2: Rename FK columns
-- =========================================================================
ALTER TABLE "Assignment" RENAME COLUMN "studentCourseId" TO "assignmentTypeId";
ALTER TABLE "AssignmentModule" RENAME COLUMN "studentCourseId" TO "assignmentTypeId";
ALTER TABLE "AssignmentModuleInstruction" RENAME COLUMN "studentCourseModuleId" TO "assignmentModuleId";
ALTER TABLE "AssignmentModuleInstructionButton" RENAME COLUMN "studentCourseModuleInstructionId" TO "assignmentModuleInstructionId";
ALTER TABLE "AssignmentModuleSession" RENAME COLUMN "studentCourseModuleId" TO "assignmentModuleId";
ALTER TABLE "AssignmentModuleSessionMessage" RENAME COLUMN "studentCourseModuleSessionId" TO "assignmentModuleSessionId";
ALTER TABLE "AssignmentTypeImage" RENAME COLUMN "studentCourseId" TO "assignmentTypeId";

-- (Similarly rename FK columns on TeacherTraining child tables — ONLY if the original
-- TeacherCourse* child tables had FK columns named `teacherCourseId`. Inspect schema.prisma
-- to confirm exact names before including these.)
-- NOTE: The subagent executing this task MUST verify these column names exist before renaming:
--   ALTER TABLE "TeacherTrainingImage" RENAME COLUMN "teacherCourseId" TO "teacherTrainingId";
--   ALTER TABLE "TeacherTrainingModule" RENAME COLUMN "teacherCourseId" TO "teacherTrainingId";
--   ALTER TABLE "TeacherTrainingModuleResource" RENAME COLUMN "teacherCourseModuleId" TO "teacherTrainingModuleId";
--   ALTER TABLE "TeacherTrainingResource" RENAME COLUMN "teacherCourseId" TO "teacherTrainingId";
--   ALTER TABLE "TeacherTrainingModuleSession" RENAME COLUMN "teacherCourseModuleId" TO "teacherTrainingModuleId";

-- =========================================================================
-- Step 3: Add owner columns to AssignmentType + CHECK constraint
-- =========================================================================
ALTER TABLE "AssignmentType"
  ADD COLUMN "ownerOrgId" TEXT NULL,
  ADD COLUMN "ownerTeacherId" TEXT NULL;

ALTER TABLE "AssignmentType"
  ADD CONSTRAINT "AssignmentType_owner_single_check"
  CHECK ("ownerOrgId" IS NULL OR "ownerTeacherId" IS NULL);

ALTER TABLE "AssignmentType"
  ADD CONSTRAINT "AssignmentType_ownerOrgId_fkey"
  FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentType"
  ADD CONSTRAINT "AssignmentType_ownerTeacherId_fkey"
  FOREIGN KEY ("ownerTeacherId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AssignmentType_ownerOrgId_idx" ON "AssignmentType"("ownerOrgId");
CREATE INDEX "AssignmentType_ownerTeacherId_idx" ON "AssignmentType"("ownerTeacherId");

-- =========================================================================
-- Step 4: Seed Free Write AssignmentType
-- =========================================================================
INSERT INTO "AssignmentType" (
  id, "createdAt", "updatedAt", title, description, position,
  "ownerOrgId", "ownerTeacherId"
)
VALUES (
  'cfreewrite0000000000000000',
  NOW(),
  NOW(),
  'Free Write',
  'An open-ended writing space. No prompt, no structure — just write.',
  0,
  NULL,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- Step 5: Delete orphan AssignmentModule rows; make FK NOT NULL
-- =========================================================================
DELETE FROM "AssignmentModule" WHERE "assignmentTypeId" IS NULL;

ALTER TABLE "AssignmentModule"
  ALTER COLUMN "assignmentTypeId" SET NOT NULL;

-- =========================================================================
-- Step 6: Add Document.assignmentTypeId (nullable initially for backfill)
-- =========================================================================
ALTER TABLE "Document"
  ADD COLUMN "assignmentTypeId" TEXT NULL;

-- =========================================================================
-- Step 7: Backfill Document.assignmentTypeId in three passes
-- =========================================================================

-- 7a: docs with an Assignment → copy from Assignment.assignmentTypeId
UPDATE "Document" d
SET "assignmentTypeId" = a."assignmentTypeId"
FROM "Assignment" a
WHERE d."assignmentId" = a.id
  AND d."assignmentTypeId" IS NULL;

-- 7b: remaining docs with a module session → derive from earliest session's AssignmentModule.assignmentTypeId
UPDATE "Document" d
SET "assignmentTypeId" = sub."assignmentTypeId"
FROM (
  SELECT DISTINCT ON (s."documentId")
    s."documentId",
    m."assignmentTypeId"
  FROM "AssignmentModuleSession" s
  JOIN "AssignmentModule" m ON m.id = s."assignmentModuleId"
  ORDER BY s."documentId", s."createdAt" ASC
) sub
WHERE d.id = sub."documentId"
  AND d."assignmentTypeId" IS NULL;

-- 7c: remaining docs → Free Write
UPDATE "Document"
SET "assignmentTypeId" = 'cfreewrite0000000000000000'
WHERE "assignmentTypeId" IS NULL;

-- =========================================================================
-- Step 8: Add Document.assignmentTypeId FK + NOT NULL + index
-- =========================================================================
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document"
  ALTER COLUMN "assignmentTypeId" SET NOT NULL;

CREATE INDEX "Document_assignmentTypeId_idx" ON "Document"("assignmentTypeId");

-- =========================================================================
-- Step 9: Drop Document.classId (and its index / FK)
-- =========================================================================
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_classId_fkey";
DROP INDEX IF EXISTS "Document_classId_idx";
ALTER TABLE "Document" DROP COLUMN "classId";

-- =========================================================================
-- Step 10: Drop ClassStudentCourse table
-- =========================================================================
DROP TABLE "ClassStudentCourse";

-- =========================================================================
-- Step 11: Rename indexes & constraints to match new table names
-- =========================================================================
-- Postgres renames tables but leaves index/constraint names referencing the old table.
-- Let the subagent executing this task inspect actual index names via:
--   SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (
--     'AssignmentType', 'AssignmentModule', 'AssignmentModuleSession',
--     'Assignment', 'TeacherTraining', ...
--   );
-- Rename all indexes whose name starts with "StudentCourse" or "TeacherCourse" to use the new prefix.
-- Example:
--   ALTER INDEX "StudentCourse_pkey" RENAME TO "AssignmentType_pkey";
--   ALTER INDEX "Assignment_studentCourseId_idx" RENAME TO "Assignment_assignmentTypeId_idx";
-- The subagent must enumerate and rename all of them so future migrations don't conflict.

COMMIT;
```

- [ ] **Step 3: Inspect TeacherCourse child table FK column names**

Before applying, confirm actual FK column names on `TeacherCourseImage`, `TeacherCourseModule`, etc. Read `packages/prisma/schema.prisma` lines 368–443. Update the "NOTE" block in migration.sql to uncomment the correct RENAME COLUMN lines.

- [ ] **Step 4: Inspect index names**

Run against local dev DB (safe — read-only):
```bash
cd packages/prisma && bun run -- psql $DATABASE_URL -c "
  SELECT tablename, indexname FROM pg_indexes
  WHERE schemaname = 'public'
    AND (indexname LIKE 'StudentCourse%' OR indexname LIKE 'TeacherCourse%' OR indexname LIKE 'ClassStudentCourse%')
  ORDER BY tablename, indexname;
"
```

Add explicit `ALTER INDEX` statements to the bottom of the migration for every index listed. Also check constraints:
```bash
cd packages/prisma && bun run -- psql $DATABASE_URL -c "
  SELECT conname, conrelid::regclass FROM pg_constraint
  WHERE conname LIKE 'StudentCourse%' OR conname LIKE 'TeacherCourse%' OR conname LIKE 'ClassStudentCourse%';
"
```

- [ ] **Step 5: Commit the migration (do NOT apply yet)**

```bash
git add packages/prisma/migrations/20260414130000_unify_assignment_model/migration.sql
git commit -m "feat(prisma): migration SQL for assignments unification

- Rename StudentCourse* → AssignmentType/AssignmentModule* tables
- Rename TeacherCourse* → TeacherTraining* tables
- Rename FK columns (studentCourseId → assignmentTypeId, etc.)
- Add ownerOrgId/ownerTeacherId to AssignmentType + CHECK constraint
- Seed Free Write AssignmentType
- Delete orphan AssignmentModule rows; set assignmentTypeId NOT NULL
- Add Document.assignmentTypeId with 3-pass backfill; enforce NOT NULL
- Drop Document.classId and ClassStudentCourse table
- Rename indexes and constraints to match new table names"
```

---

## Task 4: Update `packages/prisma/schema.prisma`

**Files:**
- Modify: `packages/prisma/schema.prisma`

**Purpose:** Reflect the post-migration schema so Prisma client types match the DB. Regenerate the client.

- [ ] **Step 1: Update schema.prisma**

Replace the models in `packages/prisma/schema.prisma`:

**AssignmentType (was StudentCourse, lines 32–43):**

```prisma
model AssignmentType {
  id                      String                @id @default(cuid())
  createdAt               DateTime              @default(now()) @db.Timestamptz(6)
  updatedAt               DateTime              @default(now()) @db.Timestamptz(6)
  title                   String
  description             String?
  position                Int
  ownerOrgId              String?
  ownerOrg                Organization?         @relation(fields: [ownerOrgId], references: [id], onDelete: Cascade)
  ownerTeacherId          String?
  ownerTeacher            Profile?              @relation("AssignmentTypeOwner", fields: [ownerTeacherId], references: [id], onDelete: Cascade)
  image                   AssignmentTypeImage?
  assignmentModules       AssignmentModule[]
  assignments             Assignment[]
  documents               Document[]

  @@index([ownerOrgId])
  @@index([ownerTeacherId])
}
```

**Assignment (was 45–62, rename column):**

```prisma
model Assignment {
  id               String         @id @default(cuid())
  createdAt        DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime       @default(now()) @db.Timestamptz(6)
  classId          String
  class            Class          @relation(fields: [classId], references: [id], onDelete: Cascade)
  assignmentTypeId String
  assignmentType   AssignmentType @relation(fields: [assignmentTypeId], references: [id], onDelete: Cascade)
  title            String?
  prompt           String
  tutorContext     String?
  dueDate          DateTime?      @db.Timestamptz(6)
  documents        Document[]

  @@index([classId, createdAt(sort: Desc)])
  @@index([assignmentTypeId])
  @@index([dueDate])
}
```

**AssignmentTypeImage (was StudentCourseImage, 64–73):**

```prisma
model AssignmentTypeImage {
  id               String         @id @default(cuid())
  createdAt        DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime       @default(now()) @db.Timestamptz(6)
  altText          String?
  contentType      String
  blob             Bytes
  assignmentTypeId String         @unique
  assignmentType   AssignmentType @relation(fields: [assignmentTypeId], references: [id], onDelete: Cascade)
}
```

**AssignmentModule (was StudentCourseModule, 75–89) — assignmentTypeId NOT NULL:**

```prisma
model AssignmentModule {
  id                       String                          @id @default(cuid())
  createdAt                DateTime                        @default(now()) @db.Timestamptz(6)
  updatedAt                DateTime                        @default(now()) @db.Timestamptz(6)
  deletedAt                DateTime?                       @db.Timestamptz(6)
  title                    String
  position                 Int
  description              String?
  tutorInstructions        String?
  isSelfGuided             Boolean                         @default(false)
  assignmentTypeId         String
  assignmentType           AssignmentType                  @relation(fields: [assignmentTypeId], references: [id], onDelete: Cascade)
  instructions             AssignmentModuleInstruction[]
  assignmentModuleSessions AssignmentModuleSession[]
}
```

**AssignmentModuleInstruction (was 91–104):**

```prisma
model AssignmentModuleInstruction {
  id                      String                              @id @default(cuid())
  createdAt               DateTime                            @default(now()) @db.Timestamptz(6)
  updatedAt               DateTime                            @default(now()) @db.Timestamptz(6)
  position                Int
  title                   String
  prompt                  String
  tutorInstructions       String?
  showChatButton          Boolean?                            @default(false)
  showNextButton          Boolean?                            @default(true)
  assignmentModuleId      String
  assignmentModule        AssignmentModule                    @relation(fields: [assignmentModuleId], references: [id], onDelete: Cascade)
  buttons                 AssignmentModuleInstructionButton[]
}
```

**AssignmentModuleInstructionButton (was 106–115):**

```prisma
model AssignmentModuleInstructionButton {
  id                            String                      @id @default(cuid())
  createdAt                     DateTime                    @default(now()) @db.Timestamptz(6)
  updatedAt                     DateTime                    @default(now()) @db.Timestamptz(6)
  position                      Int
  label                         String
  action                        String
  assignmentModuleInstructionId String
  assignmentModuleInstruction   AssignmentModuleInstruction @relation(fields: [assignmentModuleInstructionId], references: [id], onDelete: Cascade)
}
```

**AssignmentModuleSession (was StudentCourseModuleSession, 117–131):**

```prisma
model AssignmentModuleSession {
  id                           String                           @id @default(cuid())
  createdAt                    DateTime                         @default(now()) @db.Timestamptz(6)
  updatedAt                    DateTime                         @default(now()) @db.Timestamptz(6)
  deletedAt                    DateTime?                        @db.Timestamptz(6)
  title                        String                           @default("Untitled")
  instructionsCompleted        Int
  assignmentModuleId           String
  assignmentModule             AssignmentModule                 @relation(fields: [assignmentModuleId], references: [id], onDelete: Cascade)
  documentId                   String
  document                     Document                         @relation(fields: [documentId], references: [id], onDelete: Cascade)
  studentProfileId             String
  studentProfile               StudentProfile                   @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)
  messages                     AssignmentModuleSessionMessage[]
}
```

**AssignmentModuleSessionMessage (was 133–143):**

```prisma
model AssignmentModuleSessionMessage {
  id                          String                  @id @default(cuid())
  createdAt                   DateTime                @default(now()) @db.Timestamptz(6)
  instructionId               String
  content                     String
  agent                       String
  factCheckPrompt             String?
  context                     String?
  assignmentModuleSessionId   String
  assignmentModuleSession     AssignmentModuleSession @relation(fields: [assignmentModuleSessionId], references: [id], onDelete: Cascade)
}
```

**Document (145–169) — drop classId, add assignmentTypeId NOT NULL:**

```prisma
model Document {
  id                       String                    @id @default(cuid())
  createdAt                DateTime                  @default(now()) @db.Timestamptz(6)
  updatedAt                DateTime                  @default(now()) @db.Timestamptz(6)
  revision                 Int                       @default(0)
  deletedAt                DateTime?                 @db.Timestamptz(6)
  archivedAt               DateTime?                 @db.Timestamptz(6)
  title                    String                    @default("Untitled")
  text                     String?
  html                     String?
  profile                  Profile                   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  profileId                String
  assignmentTypeId         String
  assignmentType           AssignmentType            @relation(fields: [assignmentTypeId], references: [id], onDelete: Restrict)
  assignmentId             String?
  assignment               Assignment?               @relation(fields: [assignmentId], references: [id], onDelete: SetNull)
  assignmentModuleSessions AssignmentModuleSession[]
  comments                 DocumentComment[]
  writeJournals            DocumentWriteJournal[]
  pasteAlerts              PasteAlert[]
  revisions                DocumentRevision[]
  submissions              Submission[]

  @@index([assignmentId])
  @@index([assignmentTypeId])
}
```

**TeacherTraining and child models (368–443):** Rename every `TeacherCourse*` model to `TeacherTraining*`, rename FK fields from `teacherCourseId` to `teacherTrainingId` (verify exact column names against current schema). No other changes.

**Delete entirely:** the `ClassStudentCourse` model (lines 444–end of that model).

**Update back-references in other models:**

- `Class` model: find and update the `classStudentCourses: ClassStudentCourse[]` field — remove it. Also update any field referring to `Document.class` (Document no longer has classId).
- `Organization`: add `assignmentTypes AssignmentType[]` relation if currently absent.
- `Profile`: add `ownedAssignmentTypes AssignmentType[] @relation("AssignmentTypeOwner")` if not present.
- `Profile`/`Class`: remove any `studentCourses` or `classStudentCourses` relations.
- `Class`: remove `documents Document[]` if no other documents back-reference remains (check — there may still be linkage via `Assignment`).
- `StudentProfile`: update `studentCourseModuleSessions StudentCourseModuleSession[]` → `assignmentModuleSessions AssignmentModuleSession[]`.

**Also find and update any place in the schema referencing old model names.** Grep `packages/prisma/schema.prisma` for `StudentCourse`, `studentCourse`, `TeacherCourse`, `teacherCourse`, `ClassStudentCourse`, `classStudentCourse` — every match must be updated.

- [ ] **Step 2: Regenerate Prisma client**

Run: `cd packages/prisma && bunx prisma generate`
Expected: success, no errors. Generated types now use new names.

- [ ] **Step 3: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/generated
git commit -m "feat(prisma): update schema for assignments unification

Reflects the migration: AssignmentType/AssignmentModule renames,
ownerOrgId/ownerTeacherId on AssignmentType, Document.assignmentTypeId
required, TeacherTraining rename, ClassStudentCourse dropped.

Note: at this commit the web-app code has not been updated; builds
will fail until subsequent tasks land."
```

---

## Task 5: Update domain layer

**Files:**
- Rename & modify: `services/web-app/app/domain/student-documents.server.ts` → `services/web-app/app/domain/documents.server.ts`

- [ ] **Step 1: Read the current file**

Read `services/web-app/app/domain/student-documents.server.ts` in full to understand the `createStudentDocumentForCourse` signature and any other exports.

- [ ] **Step 2: Rename the file**

```bash
git mv services/web-app/app/domain/student-documents.server.ts services/web-app/app/domain/documents.server.ts
```

- [ ] **Step 3: Update the file**

In `services/web-app/app/domain/documents.server.ts`:

- Rename the main function: `createStudentDocumentForCourse` → `createDocumentForAssignmentType`.
- Update Prisma calls: `prisma.studentCourseModule` → `prisma.assignmentModule`, `prisma.studentCourseModuleSession` → `prisma.assignmentModuleSession`, `studentCourseId` → `assignmentTypeId` wherever it appears.
- When creating the Document, set `assignmentTypeId` explicitly (pass it in as a parameter or derive from the module lookup).
- Remove any `classId` from the Document creation payload.

Show the post-edit shape of the function signature at minimum:

```typescript
export async function createDocumentForAssignmentType({
  profileId,
  assignmentTypeId,
  assignmentId,
  title,
}: {
  profileId: string;
  assignmentTypeId: string;
  assignmentId?: string | null;
  title?: string;
}): Promise<{ documentId: string }> {
  // ...existing logic, adapted:
  //   - find first AssignmentModule where assignmentTypeId matches
  //   - create Document with profileId, assignmentTypeId, assignmentId (if set)
  //   - create AssignmentModuleSession linking document + module + studentProfile
}
```

- [ ] **Step 4: Enforce invariant #3 (Document.assignmentTypeId matches Assignment.assignmentTypeId)**

Per spec Design Decision / Invariant #3: if `assignmentId` is provided, the function must verify the Assignment's `assignmentTypeId` matches the passed `assignmentTypeId`; throw if they diverge.

Add this check inside `createDocumentForAssignmentType`:

```typescript
if (assignmentId) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { assignmentTypeId: true },
  });
  if (!assignment) {
    throw new Error(`Assignment ${assignmentId} not found`);
  }
  if (assignment.assignmentTypeId !== assignmentTypeId) {
    throw new Error(
      `Assignment.assignmentTypeId (${assignment.assignmentTypeId}) does not match provided assignmentTypeId (${assignmentTypeId})`
    );
  }
}
```

Also grep for other write paths that create or update Documents with both `assignmentId` and an implicit AssignmentType context — if any exist outside this domain helper, they need the same check. For this refactor it's acceptable to funnel all Document creation through this helper; if other creation paths exist, add TODO comments flagging them for follow-up or route them through this helper.

- [ ] **Step 5: Type-check this file**

Run: `cd services/web-app && bunx tsc --noEmit app/domain/documents.server.ts` (may error on upstream imports; focus on whether the file itself is internally consistent).

- [ ] **Step 6: Commit**

```bash
git add services/web-app/app/domain/documents.server.ts
git commit -m "refactor: rename student-documents.server to documents.server

- createStudentDocumentForCourse → createDocumentForAssignmentType
- Explicit assignmentTypeId on Document creation
- Invariant #3 app-layer check: assignment's type matches doc's type
- Drop classId from Document payload"
```

---

## Task 6: Update assignment-start route

**Files:**
- Modify: `services/web-app/app/routes/app.assignments.$assignmentId.start/route.ts`

- [ ] **Step 1: Read the current route**

Read the file in full.

- [ ] **Step 2: Update references**

- Replace `studentCourseId` → `assignmentTypeId` everywhere.
- Replace `studentCourse` (relation field) → `assignmentType`.
- Update the call to the domain helper: `createStudentDocumentForCourse(...)` → `createDocumentForAssignmentType(...)`, passing `assignmentTypeId: assignment.assignmentTypeId`.
- Remove any `classId` passed to the domain helper.
- Update the import path: `~/domain/student-documents.server` → `~/domain/documents.server`.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/app.assignments.$assignmentId.start/route.ts
git commit -m "refactor: update assignment-start route for assignmentType rename"
```

---

## Task 7: Update student-facing routes (home, document editor)

**Files:**
- Modify: `services/web-app/app/routes/app._index/route.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx`
- Modify: `services/web-app/app/routes/app_.documents_.$id/document-editor/editor.tsx`
- Modify: `services/web-app/app/routes/app.courses.$id/route.tsx` (and directory rename — see Step 4)
- Modify: `services/web-app/app/routes/api.model.course-module-session/route.ts` (and consider directory rename to `api.model.assignment-module-session`)

- [ ] **Step 1: Student home (`app._index/route.tsx`)**

- Rename all `studentCourse*` → `assignmentType*` (queries, variables, JSX labels as appropriate).
- Remove any `Document.classId` references.
- For "start writing" action: when no class context is implied, default to Free Write — pass `assignmentTypeId: FREE_WRITE_ASSIGNMENT_TYPE_ID` from `~/utils/assignment-types`.
- Owner-scoped type picker query: `prisma.assignmentType.findMany({ where: { OR: [{ ownerOrgId: null, ownerTeacherId: null }, { ownerOrgId: profile.organizationId }, { ownerTeacherId: profile.id }] } })`.

- [ ] **Step 2: Document editor loader and component**

- In `app_.documents_.$id/route.tsx`: replace `studentCourseModuleSessions` → `assignmentModuleSessions`, `studentCourse` → `assignmentType`, and remove `document.classId` access.
- Expose `document.assignmentType` to the component for tutor config.
- In `editor.tsx`: rename props and accesses accordingly.

- [ ] **Step 3: Course detail route (to be renamed)**

- Rename the directory: `git mv services/web-app/app/routes/app.courses.$id services/web-app/app/routes/app.assignment-types.$id`.
- Update `services/web-app/app/routes.ts` to reflect the new directory.
- Update all internal references to the new path, model names, and field names.
- Update any links in the codebase that point to `/app/courses/:id` to `/app/assignment-types/:id` (grep for `/app/courses/`).

- [ ] **Step 4: API module session route**

- Rename directory: `git mv services/web-app/app/routes/api.model.course-module-session services/web-app/app/routes/api.model.assignment-module-session`.
- Update `services/web-app/app/routes.ts`.
- Replace `studentCourseModuleSession` → `assignmentModuleSession`, `studentCourseModuleId` → `assignmentModuleId` inside.
- Update all fetch callers (grep for `api/model/course-module-session` in the codebase).

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app services/web-app/app/routes.ts
git commit -m "refactor: update student-facing routes for assignmentType rename

- app home: owner-scoped type picker, Free Write default
- Document editor: assignmentType + assignmentModuleSessions
- app.courses → app.assignment-types
- api.model.course-module-session → api.model.assignment-module-session
- Drop Document.classId references"
```

---

## Task 8: Update teacher-facing routes + delete whitelist UI

**Files:**
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/assignment-sheet.tsx`
- Modify: `services/web-app/app/routes/app.organization.classes/route.tsx`

- [ ] **Step 1: Teacher class route + assignment-sheet**

- Rename all `studentCourseId` → `assignmentTypeId`, `studentCourse` → `assignmentType`.
- Type picker in `assignment-sheet.tsx` loader: query `assignmentType` scoped to `{system (owner null), org, teacher}` — **not** via `ClassStudentCourse` (which is gone).
- Remove any UI that references the class-course whitelist.

- [ ] **Step 2: Organization.classes — delete whitelist UI**

- Remove the entire section of the UI that lets admins whitelist courses for a class.
- Delete the `classStudentCourse` Prisma calls.
- Remove the related form handlers and loader branches.
- If this leaves the route with minimal content, fine — don't pad; just ship the cleanup.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/app/routes/app.my-classes.$classId services/web-app/app/routes/app.organization.classes
git commit -m "refactor: update teacher routes; delete class-course whitelist UI

- assignment-sheet: owner-scoped type picker
- organization.classes: remove whitelist UI, ClassStudentCourse gone"
```

---

## Task 9: Rename admin student-courses routes → assignment-types

**Files:**
- Rename: `app.admin.student-courses._index` → `app.admin.assignment-types._index`
- Rename: `app.admin.student-courses.$id` → `app.admin.assignment-types.$id`
- Rename: `app.admin.student-courses.$id_.modules_.$moduleId` → `app.admin.assignment-types.$id_.modules_.$moduleId`
- Modify: `services/web-app/app/routes.ts`
- Modify: all route files within those directories

- [ ] **Step 1: Rename directories**

```bash
cd services/web-app/app/routes
git mv app.admin.student-courses._index app.admin.assignment-types._index
git mv app.admin.student-courses.$id app.admin.assignment-types.$id
git mv app.admin.student-courses.\$id_.modules_.\$moduleId app.admin.assignment-types.\$id_.modules_.\$moduleId
cd -
```

- [ ] **Step 2: Update `services/web-app/app/routes.ts`**

Grep for `student-courses` and update entries to use `assignment-types`.

- [ ] **Step 3: Update route file contents**

In each renamed route file:
- Replace Prisma model names: `studentCourse` → `assignmentType`, `studentCourseModule` → `assignmentModule`, etc.
- Update form field names in loaders/actions that used `studentCourseId`, `studentCourseModuleId`.
- Update UI labels from "Student Course" / "Course" → "Assignment Type" where user-facing.
- Update URL-generating code that builds `/app/admin/student-courses/...` → `/app/admin/assignment-types/...`.

- [ ] **Step 4: Update cross-references**

Grep the whole codebase:
```bash
rg -l '/app/admin/student-courses' services/web-app/app
```

Update each hit (nav links, redirects, etc.) to the new path.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app
git commit -m "refactor: rename admin student-courses routes → assignment-types"
```

---

## Task 10: Codebase-wide sweep — remaining `studentCourse` references

**Purpose:** Catch everything the preceding targeted tasks missed — variable names, i18n strings, tests, comments, helper functions.

- [ ] **Step 1: Grep for all remaining references**

```bash
rg -n --type ts --type tsx 'studentCourse|StudentCourse|classStudentCourse|ClassStudentCourse' services/web-app/app
```

- [ ] **Step 2: Update each hit**

For every match:
- `StudentCourse` (type/model) → `AssignmentType`
- `studentCourse` (variable/property) → `assignmentType`
- `StudentCourseModule` → `AssignmentModule`
- `studentCourseModule` → `assignmentModule`
- `StudentCourseModuleSession` → `AssignmentModuleSession`
- `studentCourseModuleSession` → `assignmentModuleSession`
- `studentCourseModuleId` → `assignmentModuleId`
- `studentCourseModuleInstruction` → `assignmentModuleInstruction`
- `studentCourseId` → `assignmentTypeId`
- `ClassStudentCourse`, `classStudentCourse`: delete the surrounding code (this is the whitelist logic; it's gone).

Special cases:
- User-facing strings ("Student Courses", "Course") → "Assignment Types", "Assignment Type" where contextually correct. Don't rewrite copy that isn't referring to the data model.
- Comments: update where they'd now mislead, leave alone where they're still accurate or not confusing.

- [ ] **Step 3: Grep again to verify zero hits**

Run the grep from Step 1 again. Expected: no results.

- [ ] **Step 4: Commit**

```bash
git add services/web-app
git commit -m "refactor: codebase-wide sweep for studentCourse references

All variable names, types, i18n strings, and helpers updated to
the AssignmentType/AssignmentModule vocabulary."
```

---

## Task 11: Codebase-wide sweep — `teacherCourse` → `teacherTraining`

- [ ] **Step 1: Grep**

```bash
rg -n --type ts --type tsx 'teacherCourse|TeacherCourse' services/web-app/app
```

- [ ] **Step 2: Update hits**

- `TeacherCourse` → `TeacherTraining`
- `teacherCourse` → `teacherTraining`
- `teacherCourseId` → `teacherTrainingId`
- (and child model variants)

- [ ] **Step 3: Grep again to verify zero hits**

- [ ] **Step 4: Commit**

```bash
git add services/web-app
git commit -m "refactor: rename TeacherCourse → TeacherTraining everywhere"
```

---

## Task 12: Update E2E tests

**Files:**
- Modify: `services/web-app/e2e/tests/assignments-feature-flag.spec.ts`
- Modify: `services/web-app/e2e/tests/student.assignment-start.spec.ts`
- Modify: any other e2e tests referencing old names

- [ ] **Step 1: Grep**

```bash
rg -n 'studentCourse|StudentCourse|teacherCourse|TeacherCourse|classStudentCourse|ClassStudentCourse|classId' services/web-app/e2e
```

Note: `classId` may legitimately still appear on `Assignment` and other models; skip those. Focus on `Document.classId` / `document.classId` / doc-creation payloads.

- [ ] **Step 2: Update each test**

- Replace Prisma client calls with new model/field names.
- Where tests hit URLs like `/app/admin/student-courses/...`, update to `/app/admin/assignment-types/...`.
- Where tests depend on `Document.classId`, remove that assertion or reshape to use `Assignment.classId`.

- [ ] **Step 3: Run e2e tests locally**

See `services/web-app/playwright.config.ts` for the exact command. Typically:
```bash
cd services/web-app && bun run test:e2e -- --project=chromium
```

Expected: tests pass. If a test fails because the product behavior genuinely changed (e.g., a test checked the whitelist UI existed), update the test to reflect the new product behavior. If it fails because of a name mismatch, fix the mismatch.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e
git commit -m "test(e2e): update for assignments unification"
```

---

## Task 13: Full-repo type-check + unit/integration tests

- [ ] **Step 1: Type-check**

Run: `cd services/web-app && bunx tsc --noEmit`
Expected: zero errors.

If errors: investigate. Common likely residues:
- Import paths still pointing at `student-documents.server`
- UI copy in JSX that still uses old names
- i18n keys not updated

Fix inline, re-run. Iterate until clean.

- [ ] **Step 2: Run the unit/integration test suite**

Per yawp-2.0 conventions: uses `bun:test`, run via `bun run test`.

Run: `cd services/web-app && bun run test`
Expected: all tests pass.

Fix any failures:
- If it's a rename mismatch → fix.
- If it's a genuine behavior change → update the test to match new behavior, but only after confirming the new behavior is correct.

- [ ] **Step 3: Commit any incidental fixes**

```bash
git add services/web-app
git commit -m "chore: fix type and unit test residue from refactor"
```

(Skip if nothing changed.)

---

## Task 14: Apply migration against local dev DB + verify counts

**Purpose:** Run the migration end-to-end on the user's local dev DB (already restored from prod). Verify pass-7 bucket counts match expectations. Verify no row count loss on renamed tables.

- [ ] **Step 1: Snapshot local dev DB**

```bash
AWS_PROFILE=yawp pg_dump $LOCAL_DATABASE_URL > /tmp/yawp-preimigration-$(date +%Y%m%d-%H%M%S).sql
```

(Adjust command to match how the user typically takes local snapshots; the memory note says AWS profile `yawp` for CLI.)

- [ ] **Step 2: Capture pre-migration counts**

Run the preflight script again:
```bash
cd packages/prisma && bun run scripts/assignments-unification-preflight.ts
```

Save the output.

- [ ] **Step 3: Apply the migration**

Run: `cd packages/prisma && bunx prisma migrate deploy`
Expected: migration runs, no errors, transaction commits.

- [ ] **Step 4: Capture post-migration counts with a new verification script**

Create `packages/prisma/scripts/assignments-unification-postcheck.ts`:

```typescript
import { PrismaClient } from "../generated";
const prisma = new PrismaClient();

async function main() {
  const counts = {
    assignmentTypes: await prisma.assignmentType.count(),
    assignments: await prisma.assignment.count(),
    assignmentModules: await prisma.assignmentModule.count(),
    assignmentModuleSessions: await prisma.assignmentModuleSession.count(),
    documents: await prisma.document.count(),
    documentsWithAssignmentTypeId: await prisma.document.count({
      where: { assignmentTypeId: { not: "" } },
    }),
    documentsOnFreeWrite: await prisma.document.count({
      where: { assignmentTypeId: "cfreewrite0000000000000000" },
    }),
    teacherTrainings: await prisma.teacherTraining.count(),
  };

  console.log("Post-migration counts:", counts);

  // Assertions
  if (counts.documents !== counts.documentsWithAssignmentTypeId) {
    throw new Error(
      `Some Documents are missing assignmentTypeId (documents=${counts.documents}, with=${counts.documentsWithAssignmentTypeId})`
    );
  }
  console.log("OK: every Document has an assignmentTypeId.");
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

Run: `cd packages/prisma && bun run scripts/assignments-unification-postcheck.ts`
Expected: counts printed, `OK: every Document has an assignmentTypeId.`

- [ ] **Step 5: Cross-check against preflight output**

Compare:
- `studentCourses` (pre) = `assignmentTypes` (post) – 1 (the +1 is the new Free Write seed)
- `assignments` (pre) = `assignments` (post)
- `studentCourseModuleSessions` (pre) = `assignmentModuleSessions` (post)
- `documents` (pre) = `documents` (post)
- `documentsOnFreeWrite` (post) = expected pass-7c count from preflight

If anything mismatches: ROLLBACK from snapshot, investigate, fix the migration SQL.

- [ ] **Step 6: Commit the postcheck script**

```bash
git add packages/prisma/scripts/assignments-unification-postcheck.ts
git commit -m "chore: add postcheck script for assignments unification migration"
```

---

## Task 15: Manual smoke test

**Purpose:** Exercise the four flows from the spec's Deploy sequence against the local dev DB.

- [ ] **Step 1: Start the dev server**

```bash
cd services/web-app && bun run dev
```

- [ ] **Step 2: Smoke tests**

Visit the app in a browser and verify:

1. **Teacher creates an Assignment** — log in as a teacher, navigate to a class, open the assignment sheet, create an Assignment. Confirm it saves with an `assignmentTypeId`. Pick a system type, an org type (if any exist), and a teacher-owned type to verify the picker's scoped query works.

2. **Student opens a class Assignment doc** — log in as a student in that class, click into the assignment, verify the Document loads, tutor is configured correctly, modules render.

3. **Student starts personal writing (Free Write)** — from student home, choose "start writing" (or equivalent). Verify a Document is created with `assignmentTypeId` = Free Write seed ID and `assignmentId` is null.

4. **Teacher views class roster + docs** — verify teacher can see all documents for students in their class. Personal Free Write docs should be visible via the profileId-in-roster query (per spec Q8 design).

- [ ] **Step 3: Write a short smoke-test report in commit message**

If all four pass:

```bash
git commit --allow-empty -m "chore: smoke test passes — assignments unification ready

- Teacher creates Assignment: OK
- Student opens class Assignment doc: OK
- Student starts Free Write: OK, attached to Free Write type
- Teacher sees class documents (including personal writing via roster): OK"
```

If any fail: investigate, fix, re-run smoke test. Do NOT commit an OK report until all four flows work.

---

## Task 16: Plan self-check before merge

- [ ] **Step 1: Re-run the full test suite**

```bash
cd services/web-app && bun run test && bun run test:e2e
```

Expected: all green.

- [ ] **Step 2: Re-run type-check**

```bash
cd services/web-app && bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Grep for leftover references one more time**

```bash
rg -n 'studentCourse|StudentCourse|teacherCourse|TeacherCourse|classStudentCourse|ClassStudentCourse' services/web-app/app services/web-app/e2e
```

Expected: zero results (other than comments intentionally referring to old names for historical context — which should be rare).

- [ ] **Step 4: Push and open PR**

```bash
git push
```

Then open a PR from `assignments-unification` → `main`:

```
Title: feat: assignments unification — AssignmentType/Assignment domain refactor

Body:
## Summary
Collapses StudentCourse into AssignmentType; Document requires AssignmentType; drops ClassStudentCourse; renames TeacherCourse → TeacherTraining.

See spec: docs/superpowers/specs/2026-04-14-assignments-unification-design.md

## Test plan
- [x] Preflight passes locally
- [x] Migration applies locally; postcheck counts match
- [x] Unit/integration tests green
- [x] E2E tests green
- [x] Manual smoke tests: teacher create Assignment, student class doc, student Free Write, teacher sees all docs

## Deploy plan
Single-window deploy per spec:
1. Maintenance page on
2. pg_dump snapshot
3. `prisma migrate deploy`
4. Deploy app
5. Smoke tests (4 flows)
6. Maintenance page off
```

---

## Appendix: Free Write AssignmentType seed details

The `Free Write` AssignmentType created by the migration has:
- `id = "cfreewrite0000000000000000"` (deterministic; referenced from `FREE_WRITE_ASSIGNMENT_TYPE_ID` constant)
- `title = "Free Write"`
- `description = "An open-ended writing space. No prompt, no structure — just write."`
- `position = 0`
- `ownerOrgId = NULL`, `ownerTeacherId = NULL` (system-owned)
- No AssignmentModules attached (intentional — it's a blank canvas)

The tutor's behavior when a Document is attached to Free Write with no modules: defer to the default "general writing coach" prompt that the tutor already uses when no module guidance is available. If the current tutor code *requires* at least one module, that's a product bug surfaced by this refactor — add a minimal `AssignmentModule` to the Free Write seed in Step 4 of the migration, or adjust the tutor to handle moduleless types. Decide and document in the PR.
