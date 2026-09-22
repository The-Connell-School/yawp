-- One student's individual grade on a shared draft.
--
-- The group's own grade lives on Submission — one document, one submission, one
-- grade for the work. This is the per-student overlay: the group gets a grade,
-- and each member also gets one for what they contributed.
--
-- Keyed to the group rather than to a Submission on purpose. Submitting a group
-- draft is not wired yet, so hanging member grades off a Submission would mean
-- they could not be entered at all. It also lets a teacher grade contributions
-- on ungraded group work, which is how the pilot runs.
--
-- releasedAt mirrors Submission.releasedAt: null means the teacher is still
-- working and the student sees nothing, so nothing leaks mid-grading.
--
-- Additive. No existing table is touched.

BEGIN;

CREATE TABLE "DocumentGroupMemberGrade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "score" TEXT,
    "feedback" TEXT,
    "gradedByMembershipId" TEXT,
    "releasedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DocumentGroupMemberGrade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentGroupMemberGrade_membershipId_idx" ON "DocumentGroupMemberGrade"("membershipId");

CREATE UNIQUE INDEX "DocumentGroupMemberGrade_groupId_membershipId_key" ON "DocumentGroupMemberGrade"("groupId", "membershipId");

ALTER TABLE "DocumentGroupMemberGrade" ADD CONSTRAINT "DocumentGroupMemberGrade_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DocumentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentGroupMemberGrade" ADD CONSTRAINT "DocumentGroupMemberGrade_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentGroupMemberGrade" ADD CONSTRAINT "DocumentGroupMemberGrade_gradedByMembershipId_fkey" FOREIGN KEY ("gradedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
