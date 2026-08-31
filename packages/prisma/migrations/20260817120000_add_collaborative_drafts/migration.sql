-- Collaborative drafts: foundation only.
--
-- Additive in every respect. Nothing reads or writes the new tables yet, both new
-- booleans default to false, and every existing document has no DocumentGroup row —
-- so the widened document authorization predicates match exactly who they matched
-- before this migration for all existing single-author work.
--
-- Two separate switches, deliberately named apart so they cannot be confused:
--   Organization.collaborativeDraftsEnabled — rollout gate, may this org use it at all
--   Assignment.collaborationEnabled        — the teacher's per-assignment toggle

BEGIN;

-- Rollout gate, matching the house pattern set by reporterEnabled,
-- classInsightsEnabled and writingPracticeEnabled.
ALTER TABLE "Organization"
  ADD COLUMN "collaborativeDraftsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- The teacher's toggle plus how groups should be formed. Mode is a text column
-- rather than an enum, matching "gradingAssistantStrictnessLevel".
ALTER TABLE "Assignment"
  ADD COLUMN "collaborationEnabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collaborationGroupMode" TEXT NOT NULL DEFAULT 'teacher',
  ADD COLUMN "collaborationGroupSize" INTEGER;

-- Mirrored onto saved assignments so reuse preserves the setting.
ALTER TABLE "SavedAssignment"
  ADD COLUMN "collaborationEnabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collaborationGroupMode" TEXT NOT NULL DEFAULT 'teacher',
  ADD COLUMN "collaborationGroupSize" INTEGER;

-- One group within one ClassAssignment. Groups hang off ClassAssignment, not
-- Assignment, because they are made of students and an Assignment fans out to one
-- ClassAssignment per class.
--
-- "documentId" is null until the teacher opens groups, at which point each group is
-- provisioned one shared draft. "openedAt" is the lifecycle boundary: before it the
-- group is only a seating chart and reshuffling is free.
CREATE TABLE "DocumentGroup" (
  "id"                TEXT NOT NULL,
  "createdAt"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "classAssignmentId" TEXT NOT NULL,
  "label"             TEXT NOT NULL,
  "ordinal"           INTEGER NOT NULL,
  "openedAt"          TIMESTAMPTZ(6),
  "documentId"        TEXT,

  CONSTRAINT "DocumentGroup_pkey" PRIMARY KEY ("id")
);

-- A document belongs to at most one group.
CREATE UNIQUE INDEX "DocumentGroup_documentId_key"
  ON "DocumentGroup"("documentId");

-- Group numbering is stable and unambiguous within a class assignment, so
-- "Group 2" always means the same group.
CREATE UNIQUE INDEX "DocumentGroup_classAssignmentId_ordinal_key"
  ON "DocumentGroup"("classAssignmentId", "ordinal");

ALTER TABLE "DocumentGroup"
  ADD CONSTRAINT "DocumentGroup_classAssignmentId_fkey"
  FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: archiving or deleting a document must not delete
-- the teacher's group roster.
ALTER TABLE "DocumentGroup"
  ADD CONSTRAINT "DocumentGroup_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A student's membership in a group. Removal is soft: a student moved to another
-- group keeps their attributed text in the draft they wrote it in, and this row
-- records that they were once a member. "removedAt" being non-null is what
-- withdraws write access, so every authorization predicate filters on it.
CREATE TABLE "DocumentGroupMember" (
  "id"           TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "groupId"      TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "removedAt"    TIMESTAMPTZ(6),

  CONSTRAINT "DocumentGroupMember_pkey" PRIMARY KEY ("id")
);

-- A student appears at most once per group. Re-adding someone who was removed
-- clears "removedAt" on the existing row rather than inserting a second one.
CREATE UNIQUE INDEX "DocumentGroupMember_groupId_membershipId_key"
  ON "DocumentGroupMember"("groupId", "membershipId");

CREATE INDEX "DocumentGroupMember_membershipId_idx"
  ON "DocumentGroupMember"("membershipId");

-- Serves the authorization predicate, which always filters "removedAt IS NULL".
CREATE INDEX "DocumentGroupMember_groupId_removedAt_idx"
  ON "DocumentGroupMember"("groupId", "removedAt");

ALTER TABLE "DocumentGroupMember"
  ADD CONSTRAINT "DocumentGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "DocumentGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentGroupMember"
  ADD CONSTRAINT "DocumentGroupMember_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
