-- Scope collaborative drafts to specific assignment types.
--
-- The organization-level gates that shipped earlier default to false, which is
-- correct for a real rollout but means the feature is invisible everywhere --
-- including preview. For the prototype the gate moves to the assignment type, so
-- collaboration is offered for one course and nowhere else.
--
-- Additive. Every other assignment type keeps the default of false and behaves
-- exactly as it does today.

BEGIN;

ALTER TABLE "AssignmentType"
  ADD COLUMN "collaborationSupported" BOOLEAN NOT NULL DEFAULT false;

-- GBA 300 is the prototype course. Matched on the trimmed title rather than an
-- id so this applies in every environment; several seeded titles carry trailing
-- whitespace, hence the TRIM.
UPDATE "AssignmentType"
   SET "collaborationSupported" = true
 WHERE TRIM("title") = 'GBA 300';

COMMIT;
