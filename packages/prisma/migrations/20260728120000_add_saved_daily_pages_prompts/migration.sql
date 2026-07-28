-- "My prompts": Daily Pages prompts a teacher generated and kept.
-- Additive only — nothing existing reads or writes this table.

BEGIN;

CREATE TABLE "SavedDailyPagesPrompt" (
  "id"               TEXT NOT NULL,
  "createdAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "membershipId"     TEXT NOT NULL,
  "assignmentTypeId" TEXT NOT NULL,
  "prompt"           TEXT NOT NULL,
  "promptHash"       TEXT NOT NULL,
  "facets"           JSONB,
  "source"           TEXT NOT NULL DEFAULT 'generator',
  "archivedAt"       TIMESTAMPTZ(6),

  CONSTRAINT "SavedDailyPagesPrompt_pkey" PRIMARY KEY ("id")
);

-- One row per (teacher, assignment type, prompt text): saving a draft and then
-- using it must not create a duplicate. The text itself is identified by a
-- sha256 hash of its trimmed form so the index stays small.
CREATE UNIQUE INDEX "SavedDailyPagesPrompt_membershipId_assignmentTypeId_promptHash_key"
  ON "SavedDailyPagesPrompt"("membershipId", "assignmentTypeId", "promptHash");

CREATE INDEX "SavedDailyPagesPrompt_membershipId_assignmentTypeId_archivedAt_idx"
  ON "SavedDailyPagesPrompt"("membershipId", "assignmentTypeId", "archivedAt");

ALTER TABLE "SavedDailyPagesPrompt"
  ADD CONSTRAINT "SavedDailyPagesPrompt_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedDailyPagesPrompt"
  ADD CONSTRAINT "SavedDailyPagesPrompt_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
