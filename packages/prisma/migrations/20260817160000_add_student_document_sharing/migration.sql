-- The second road to a shared document: a student starts their own shared draft
-- and invites classmates.
--
-- Both roads converge on the same DocumentGroup / DocumentGroupMember tables and
-- therefore the same authorization predicates, dual-write and editor. The only
-- differences are who may create a group and which gate permits it, which is what
-- `kind` records.
--
-- Additive, and inert: the new gate defaults false, `kind` defaults to the
-- existing meaning, and both new nullable columns are null for every existing row.

BEGIN;

-- Separate from collaborativeDraftsEnabled on purpose: a school may want
-- teacher-assigned group work without students forming their own groups.
ALTER TABLE "Organization"
  ADD COLUMN "studentDocumentSharingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Which road produced the group. Existing rows are all teacher-assigned, which is
-- exactly what the default says.
ALTER TABLE "DocumentGroup"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'assignment';

-- Set once the room has been seeded from the document's existing HTML. A durable
-- guard against seeding twice, which would duplicate a student's essay.
ALTER TABLE "DocumentGroup"
  ADD COLUMN "seededAt" TIMESTAMPTZ(6);

-- A student share belongs to no class assignment. Postgres treats NULLs as
-- distinct in a unique index, so the existing
-- (classAssignmentId, ordinal) uniqueness keeps working for assignment groups
-- while many student shares coexist at ordinal 0.
ALTER TABLE "DocumentGroup"
  ALTER COLUMN "classAssignmentId" DROP NOT NULL;

-- The foreign key has to be recreated to change its delete behavior alongside the
-- now-nullable column. Cascade is still right for assignment groups: deleting a
-- class assignment removes its groups.
ALTER TABLE "DocumentGroup"
  DROP CONSTRAINT "DocumentGroup_classAssignmentId_fkey";

ALTER TABLE "DocumentGroup"
  ADD CONSTRAINT "DocumentGroup_classAssignmentId_fkey"
  FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DocumentGroup_kind_idx" ON "DocumentGroup"("kind");

COMMIT;
