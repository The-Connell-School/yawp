-- "My Saved Assignments": assignment configurations a teacher kept for reuse.
-- Additive only — nothing existing reads or writes this table.

BEGIN;

CREATE TABLE "SavedAssignment" (
  "id"                              TEXT NOT NULL,
  "createdAt"                       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "membershipId"                    TEXT NOT NULL,
  "assignmentTypeId"                TEXT NOT NULL,
  "title"                           TEXT NOT NULL,
  "prompt"                          TEXT NOT NULL,
  "promptHash"                      TEXT NOT NULL,
  "submitForGrade"                  BOOLEAN NOT NULL DEFAULT true,
  "pointValue"                      INTEGER,
  "gradingAssistantStrictnessLevel" TEXT NOT NULL DEFAULT 'intermediate',
  "tutorEnabled"                    BOOLEAN NOT NULL DEFAULT true,
  "source"                          TEXT NOT NULL DEFAULT 'creation-sheet',
  "archivedAt"                      TIMESTAMPTZ(6),

  CONSTRAINT "SavedAssignment_pkey" PRIMARY KEY ("id")
);

-- One row per (teacher, assignment type, prompt body): saving the same
-- assignment twice must not create a duplicate. The body itself is too long to
-- index, so it is identified by a sha256 hash of its trimmed text.
CREATE UNIQUE INDEX "SavedAssignment_membership_type_promptHash_key"
  ON "SavedAssignment"("membershipId", "assignmentTypeId", "promptHash");

CREATE INDEX "SavedAssignment_membership_archivedAt_idx"
  ON "SavedAssignment"("membershipId", "archivedAt");

CREATE INDEX "SavedAssignment_assignmentTypeId_idx"
  ON "SavedAssignment"("assignmentTypeId");

ALTER TABLE "SavedAssignment"
  ADD CONSTRAINT "SavedAssignment_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedAssignment"
  ADD CONSTRAINT "SavedAssignment_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
