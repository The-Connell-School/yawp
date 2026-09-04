-- Whose coaching conversation a module session is.
--
-- On a solo document there is exactly one student, so the column was redundant
-- and every existing row leaves it null, meaning "the document's owner". Nothing
-- about solo writing changes.
--
-- On a shared draft it is not redundant. Each member gets their own transcript
-- and their own progress through the modules, so one student asking the tutor a
-- question does not put it in front of their group, and one student finishing a
-- module does not advance it for everyone.
--
-- Deliberately NOT backfilled to the document owner. Null is the correct value
-- for a solo session: it means "belongs to whoever owns this document", which
-- stays true if ownership is ever reassigned, and it keeps the existing
-- owner-scoped query working unchanged.
--
-- Additive and nullable, so every read that does not know about this column
-- keeps returning exactly what it returned before.

BEGIN;

ALTER TABLE "AssignmentModuleSession" ADD COLUMN "membershipId" TEXT;

ALTER TABLE "AssignmentModuleSession"
  ADD CONSTRAINT "AssignmentModuleSession_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Every read of a shared draft's sessions filters by member, so this is the
-- index those queries want.
CREATE INDEX "AssignmentModuleSession_documentId_membershipId_idx"
  ON "AssignmentModuleSession"("documentId", "membershipId");

COMMIT;
