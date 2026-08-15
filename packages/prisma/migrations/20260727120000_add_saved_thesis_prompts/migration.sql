-- "My prompts": thesis-driven essay prompts a teacher generated and kept.
-- Additive only — nothing existing reads or writes this table yet.

BEGIN;

CREATE TABLE "SavedThesisPrompt" (
  "id"               TEXT NOT NULL,
  "createdAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "membershipId"     TEXT NOT NULL,
  "assignmentTypeId" TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "prompt"           TEXT NOT NULL,
  "promptHash"       TEXT NOT NULL,
  "source"           TEXT NOT NULL DEFAULT 'generator',
  "archivedAt"       TIMESTAMPTZ(6),

  CONSTRAINT "SavedThesisPrompt_pkey" PRIMARY KEY ("id")
);

-- One row per (teacher, assignment type, prompt body): saving a draft and then
-- using it must not create a duplicate. The body itself is too long to index,
-- so it is identified by a sha256 hash of its trimmed text.
CREATE UNIQUE INDEX "SavedThesisPrompt_membershipId_assignmentTypeId_promptHash_key"
  ON "SavedThesisPrompt"("membershipId", "assignmentTypeId", "promptHash");

CREATE INDEX "SavedThesisPrompt_membershipId_assignmentTypeId_archivedAt_idx"
  ON "SavedThesisPrompt"("membershipId", "assignmentTypeId", "archivedAt");

ALTER TABLE "SavedThesisPrompt"
  ADD CONSTRAINT "SavedThesisPrompt_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedThesisPrompt"
  ADD CONSTRAINT "SavedThesisPrompt_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
