-- "My prompts": AP English Language prompts a teacher generated and kept.
-- Additive only — nothing existing reads or writes this table.

BEGIN;

CREATE TABLE "SavedApEnglishLangPrompt" (
  "id"               TEXT NOT NULL,
  "createdAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "membershipId"     TEXT NOT NULL,
  "assignmentTypeId" TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "prompt"           TEXT NOT NULL,
  "promptHash"       TEXT NOT NULL,
  "facets"           JSONB,
  "source"           TEXT NOT NULL DEFAULT 'generator',
  "archivedAt"       TIMESTAMPTZ(6),

  CONSTRAINT "SavedApEnglishLangPrompt_pkey" PRIMARY KEY ("id")
);

-- One row per (teacher, assignment type, prompt text): saving a draft and then
-- using it must not create a duplicate. The text itself is identified by a
-- sha256 hash of its trimmed form so the index stays small.
--
-- Both index names are abbreviated: spelling out every column would exceed
-- Postgres's 63-byte identifier limit and be silently truncated, so they are
-- pinned here and in schema.prisma (via `map:`) to stay in agreement.
CREATE UNIQUE INDEX "SavedApEnglishLangPrompt_membership_type_hash_key"
  ON "SavedApEnglishLangPrompt"("membershipId", "assignmentTypeId", "promptHash");

CREATE INDEX "SavedApEnglishLangPrompt_membership_type_archived_idx"
  ON "SavedApEnglishLangPrompt"("membershipId", "assignmentTypeId", "archivedAt");

ALTER TABLE "SavedApEnglishLangPrompt"
  ADD CONSTRAINT "SavedApEnglishLangPrompt_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedApEnglishLangPrompt"
  ADD CONSTRAINT "SavedApEnglishLangPrompt_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
