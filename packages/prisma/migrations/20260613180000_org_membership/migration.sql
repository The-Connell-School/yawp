-- OrgMembership migration: consolidate Profile + TeacherProfile + StudentProfile

-- 1. Add MembershipRole enum + columns to Profile
CREATE TYPE "MembershipRole" AS ENUM ('TEACHER', 'STUDENT');

ALTER TABLE "Profile"
  ADD COLUMN "role" "MembershipRole",
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "school" TEXT,
  ADD COLUMN "schoolTeacher" TEXT,
  ADD COLUMN "grade" TEXT,
  ADD COLUMN "period" TEXT;

-- 2. Backfill role from sub-profiles (both -> TEACHER)
UPDATE "Profile" p
SET "role" = 'TEACHER'
WHERE EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
  AND EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id);

UPDATE "Profile" p
SET "role" = 'TEACHER'
WHERE "role" IS NULL
  AND EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id);

UPDATE "Profile" p
SET "role" = 'STUDENT'
WHERE "role" IS NULL
  AND EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id);

-- 3. Backfill teacher/student fields
UPDATE "Profile" p
SET "isActive" = tp."isActive"
FROM "TeacherProfile" tp
WHERE tp."profileId" = p.id;

UPDATE "Profile" p
SET
  "school" = sp."school",
  "schoolTeacher" = sp."schoolTeacher",
  "grade" = sp."grade",
  "period" = sp."period"
FROM "StudentProfile" sp
WHERE sp."profileId" = p.id;

-- 4. Rename isOwner -> isOrgOwner
ALTER TABLE "Profile" RENAME COLUMN "isOwner" TO "isOrgOwner";

-- 5. Fix Document profileId mismatches via studentProfile
UPDATE "Document" d
SET "profileId" = sp."profileId"
FROM "StudentProfile" sp
WHERE sp.id = d."studentProfileId"
  AND d."profileId" <> sp."profileId";

-- 5b. Rewire teacher-scoped feature flags from TeacherProfile.id -> Profile.id (OrgMembership.id)
CREATE TABLE "FeatureAccessTargetTeacherForensic" AS
SELECT
  fat.*,
  NOW() AS "capturedAt"
FROM "FeatureAccessTarget" fat
WHERE fat."targetKind" = 'teacher';

UPDATE "FeatureAccessTarget" fat
SET "targetId" = tp."profileId"
FROM "TeacherProfile" tp
WHERE fat."targetKind" = 'teacher'
  AND fat."targetId" = tp."id"
  AND fat."targetId" <> tp."profileId";

-- 5c. Dedupe duplicate Profile rows per (userId, organizationId)
CREATE TABLE "ProfileDuplicateForensic" AS
SELECT p.*, NOW() AS "archivedAt"
FROM "Profile" p
INNER JOIN (
  SELECT "userId", "organizationId"
  FROM "Profile"
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
) d ON d."userId" = p."userId" AND d."organizationId" = p."organizationId";

CREATE TEMP TABLE _profile_dedupe_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    p.id,
    p."userId",
    p."organizationId",
    p."isOrgOwner",
    ROW_NUMBER() OVER (
      PARTITION BY p."userId", p."organizationId"
      ORDER BY
        (EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)) DESC,
        (EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id)) DESC,
        p."isOrgOwner" DESC,
        p."createdAt" ASC
    ) AS rn
  FROM "Profile" p
)
SELECT loser.id AS loser_id, keeper.id AS keeper_id
FROM ranked loser
JOIN ranked keeper
  ON keeper."userId" = loser."userId"
 AND keeper."organizationId" = loser."organizationId"
 AND keeper.rn = 1
WHERE loser.rn > 1;

UPDATE "Profile" keeper
SET "isOrgOwner" = true
FROM _profile_dedupe_map m
JOIN "Profile" loser ON loser.id = m.loser_id
WHERE keeper.id = m.keeper_id AND loser."isOrgOwner" = true;

UPDATE "Document" d
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."profileId" = m.loser_id;

UPDATE "DocumentComment" d
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."profileId" = m.loser_id;

UPDATE "DocumentCommentResponse" d
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."profileId" = m.loser_id;

UPDATE "PasteAlert" d
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."profileId" = m.loser_id;

UPDATE "Submission" d
SET "gradedById" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."gradedById" = m.loser_id;

UPDATE "SubmissionComment" d
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."profileId" = m.loser_id;

UPDATE "AssignmentType" d
SET "ownerTeacherId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."ownerTeacherId" = m.loser_id;

UPDATE "GradingAssistantTemplate" d
SET "createdById" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."createdById" = m.loser_id;

UPDATE "GradingAssistantTemplate" d
SET "updatedById" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."updatedById" = m.loser_id;

UPDATE "DocumentWriteJournal" d
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE d."profileId" = m.loser_id;

UPDATE "TeacherProfile" tp
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE tp."profileId" = m.loser_id;

UPDATE "StudentProfile" sp
SET "profileId" = m.keeper_id
FROM _profile_dedupe_map m
WHERE sp."profileId" = m.loser_id;

DELETE FROM "Profile" p
USING _profile_dedupe_map m
WHERE p.id = m.loser_id;

-- 5d. Archive and remove Profile rows with no teacher/student sub-profiles
CREATE TABLE "ProfileOrphanForensic" AS
SELECT p.*, NOW() AS "archivedAt"
FROM "Profile" p
WHERE NOT EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id);

DELETE FROM "Profile" p
WHERE NOT EXISTS (SELECT 1 FROM "TeacherProfile" tp WHERE tp."profileId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "StudentProfile" sp WHERE sp."profileId" = p.id);

DO $$
DECLARE
  unresolved_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM "Profile"
  WHERE "role" IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'OrgMembership migration blocked: % Profile rows have no TeacherProfile or StudentProfile after dedupe/orphan cleanup', unresolved_count;
  END IF;
END $$;

-- 6. Rewire join tables to membership (profile) ids
ALTER TABLE "_ClassToTeacherProfile" DROP CONSTRAINT "_ClassToTeacherProfile_B_fkey";
ALTER TABLE "_ClassToStudentProfile" DROP CONSTRAINT "_ClassToStudentProfile_B_fkey";
ALTER TABLE "_SchoolToTeacherProfile" DROP CONSTRAINT "_SchoolToTeacherProfile_B_fkey";
ALTER TABLE "_TeacherTrainingAssignments" DROP CONSTRAINT "_TeacherTrainingAssignments_B_fkey";

UPDATE "_ClassToTeacherProfile" jt
SET "B" = tp."profileId"
FROM "TeacherProfile" tp
WHERE jt."B" = tp."id";

UPDATE "_ClassToStudentProfile" jt
SET "B" = sp."profileId"
FROM "StudentProfile" sp
WHERE jt."B" = sp."id";

UPDATE "_SchoolToTeacherProfile" jt
SET "B" = tp."profileId"
FROM "TeacherProfile" tp
WHERE jt."B" = tp."id";

UPDATE "_TeacherTrainingAssignments" jt
SET "B" = tp."profileId"
FROM "TeacherProfile" tp
WHERE jt."B" = tp."id";

DELETE FROM "_ClassToTeacherProfile" a
USING "_ClassToTeacherProfile" b
WHERE a.ctid < b.ctid AND a."A" = b."A" AND a."B" = b."B";

DELETE FROM "_ClassToStudentProfile" a
USING "_ClassToStudentProfile" b
WHERE a.ctid < b.ctid AND a."A" = b."A" AND a."B" = b."B";

DELETE FROM "_SchoolToTeacherProfile" a
USING "_SchoolToTeacherProfile" b
WHERE a.ctid < b.ctid AND a."A" = b."A" AND a."B" = b."B";

DELETE FROM "_TeacherTrainingAssignments" a
USING "_TeacherTrainingAssignments" b
WHERE a.ctid < b.ctid AND a."A" = b."A" AND a."B" = b."B";

-- 7. TeacherTrainingModuleSession: add membershipId, backfill, drop teacherProfileId
ALTER TABLE "TeacherTrainingModuleSession" ADD COLUMN "membershipId" TEXT;

UPDATE "TeacherTrainingModuleSession" ttms
SET "membershipId" = tp."profileId"
FROM "TeacherProfile" tp
WHERE tp.id = ttms."teacherProfileId";

ALTER TABLE "TeacherTrainingModuleSession" DROP CONSTRAINT "TeacherTrainingModuleSession_teacherProfileId_fkey";
DROP INDEX "TeacherTrainingModuleSession_teacherTrainingModuleId_teache_key";
ALTER TABLE "TeacherTrainingModuleSession" DROP COLUMN "teacherProfileId";
ALTER TABLE "TeacherTrainingModuleSession" ALTER COLUMN "membershipId" SET NOT NULL;

-- 8. Drop studentProfileId from Document
CREATE TABLE "DocumentStudentProfileIdForensic" (
  "documentId" TEXT PRIMARY KEY,
  "studentProfileId" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

INSERT INTO "DocumentStudentProfileIdForensic" ("documentId", "studentProfileId")
SELECT "id", "studentProfileId"
FROM "Document"
WHERE "studentProfileId" IS NOT NULL;

ALTER TABLE "Document" DROP CONSTRAINT "Document_studentProfileId_fkey";
DROP INDEX "Document_studentProfileId_idx";
ALTER TABLE "Document" DROP COLUMN "studentProfileId";

-- 9. Archive sub-profile tables, then drop live tables
CREATE TABLE "TeacherProfileForensic" AS TABLE "TeacherProfile" WITH DATA;
CREATE TABLE "StudentProfileForensic" AS TABLE "StudentProfile" WITH DATA;

ALTER TABLE "TeacherProfile" DROP CONSTRAINT "TeacherProfile_profileId_fkey";
ALTER TABLE "StudentProfile" DROP CONSTRAINT "StudentProfile_profileId_fkey";
DROP TABLE "TeacherProfile";
DROP TABLE "StudentProfile";

-- 10. Rename Profile -> OrgMembership; rename profileId columns to membershipId where needed
ALTER TABLE "Profile" RENAME TO "OrgMembership";
ALTER INDEX "Profile_pkey" RENAME TO "OrgMembership_pkey";
ALTER TABLE "OrgMembership" RENAME CONSTRAINT "Profile_organizationId_fkey" TO "OrgMembership_organizationId_fkey";
ALTER TABLE "OrgMembership" RENAME CONSTRAINT "Profile_userId_fkey" TO "OrgMembership_userId_fkey";

ALTER TABLE "Document" DROP CONSTRAINT "Document_profileId_fkey";
ALTER TABLE "Document" RENAME COLUMN "profileId" TO "membershipId";
CREATE INDEX "Document_membershipId_idx" ON "Document"("membershipId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentComment" DROP CONSTRAINT "DocumentComment_profileId_fkey";
ALTER TABLE "DocumentComment" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentCommentResponse" DROP CONSTRAINT "DocumentCommentResponse_profileId_fkey";
ALTER TABLE "DocumentCommentResponse" RENAME COLUMN "profileId" TO "membershipId";
ALTER TABLE "DocumentCommentResponse" ADD CONSTRAINT "DocumentCommentResponse_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasteAlert" DROP CONSTRAINT "PasteAlert_profileId_fkey";
DROP INDEX "PasteAlert_profileId_createdAt_idx";
ALTER TABLE "PasteAlert" RENAME COLUMN "profileId" TO "membershipId";
CREATE INDEX "PasteAlert_membershipId_createdAt_idx" ON "PasteAlert"("membershipId", "createdAt" DESC);
ALTER TABLE "PasteAlert" ADD CONSTRAINT "PasteAlert_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Submission" DROP CONSTRAINT "Submission_gradedById_fkey";
DROP INDEX "Submission_gradedById_idx";
ALTER TABLE "Submission" RENAME COLUMN "gradedById" TO "gradedByMembershipId";
CREATE INDEX "Submission_gradedByMembershipId_idx" ON "Submission"("gradedByMembershipId");
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedByMembershipId_fkey"
  FOREIGN KEY ("gradedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubmissionComment" DROP CONSTRAINT "SubmissionComment_profileId_fkey";
DROP INDEX "SubmissionComment_profileId_idx";
ALTER TABLE "SubmissionComment" RENAME COLUMN "profileId" TO "membershipId";
CREATE INDEX "SubmissionComment_membershipId_idx" ON "SubmissionComment"("membershipId");
ALTER TABLE "SubmissionComment" ADD CONSTRAINT "SubmissionComment_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssignmentType" DROP CONSTRAINT "AssignmentType_ownerTeacherId_fkey";
DROP INDEX "AssignmentType_ownerTeacherId_idx";
ALTER TABLE "AssignmentType" RENAME COLUMN "ownerTeacherId" TO "ownerMembershipId";
CREATE INDEX "AssignmentType_ownerMembershipId_idx" ON "AssignmentType"("ownerMembershipId");
ALTER TABLE "AssignmentType" ADD CONSTRAINT "AssignmentType_ownerMembershipId_fkey"
  FOREIGN KEY ("ownerMembershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GradingAssistantTemplate" DROP CONSTRAINT "GradingAssistantTemplate_createdById_fkey";
ALTER TABLE "GradingAssistantTemplate" DROP CONSTRAINT "GradingAssistantTemplate_updatedById_fkey";
DROP INDEX "GradingAssistantTemplate_createdById_idx";
DROP INDEX "GradingAssistantTemplate_updatedById_idx";
ALTER TABLE "GradingAssistantTemplate" RENAME COLUMN "createdById" TO "createdByMembershipId";
ALTER TABLE "GradingAssistantTemplate" RENAME COLUMN "updatedById" TO "updatedByMembershipId";
CREATE INDEX "GradingAssistantTemplate_createdByMembershipId_idx" ON "GradingAssistantTemplate"("createdByMembershipId");
CREATE INDEX "GradingAssistantTemplate_updatedByMembershipId_idx" ON "GradingAssistantTemplate"("updatedByMembershipId");
ALTER TABLE "GradingAssistantTemplate" ADD CONSTRAINT "GradingAssistantTemplate_createdByMembershipId_fkey"
  FOREIGN KEY ("createdByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GradingAssistantTemplate" ADD CONSTRAINT "GradingAssistantTemplate_updatedByMembershipId_fkey"
  FOREIGN KEY ("updatedByMembershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentWriteJournal" RENAME COLUMN "profileId" TO "membershipId";

-- 11. Rename join tables to match Prisma implicit names
ALTER TABLE "_ClassToTeacherProfile" RENAME TO "_ClassTeachers";
ALTER TABLE "_ClassTeachers" RENAME CONSTRAINT "_ClassToTeacherProfile_AB_pkey" TO "_ClassTeachers_AB_pkey";
ALTER INDEX "_ClassToTeacherProfile_B_index" RENAME TO "_ClassTeachers_B_index";
ALTER TABLE "_ClassTeachers" RENAME CONSTRAINT "_ClassToTeacherProfile_A_fkey" TO "_ClassTeachers_A_fkey";

ALTER TABLE "_ClassToStudentProfile" RENAME TO "_ClassStudents";
ALTER TABLE "_ClassStudents" RENAME CONSTRAINT "_ClassToStudentProfile_AB_pkey" TO "_ClassStudents_AB_pkey";
ALTER INDEX "_ClassToStudentProfile_B_index" RENAME TO "_ClassStudents_B_index";
ALTER TABLE "_ClassStudents" RENAME CONSTRAINT "_ClassToStudentProfile_A_fkey" TO "_ClassStudents_A_fkey";

ALTER TABLE "_SchoolToTeacherProfile" RENAME TO "_SchoolTeachers";
ALTER TABLE "_SchoolTeachers" RENAME CONSTRAINT "_SchoolToTeacherProfile_AB_pkey" TO "_SchoolTeachers_AB_pkey";
ALTER INDEX "_SchoolToTeacherProfile_B_index" RENAME TO "_SchoolTeachers_B_index";
ALTER TABLE "_SchoolTeachers" RENAME CONSTRAINT "_SchoolToTeacherProfile_A_fkey" TO "_SchoolTeachers_A_fkey";

-- 12. SET NOT NULL on role, add unique(userId, organizationId)
ALTER TABLE "OrgMembership" ALTER COLUMN "role" SET NOT NULL;
CREATE UNIQUE INDEX "OrgMembership_userId_organizationId_key" ON "OrgMembership"("userId", "organizationId");

-- 13. Re-add foreign keys on join tables and training sessions
ALTER TABLE "_ClassTeachers" ADD CONSTRAINT "_ClassTeachers_B_fkey"
  FOREIGN KEY ("B") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_ClassStudents" ADD CONSTRAINT "_ClassStudents_B_fkey"
  FOREIGN KEY ("B") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_SchoolTeachers" ADD CONSTRAINT "_SchoolTeachers_B_fkey"
  FOREIGN KEY ("B") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_TeacherTrainingAssignments" ADD CONSTRAINT "_TeacherTrainingAssignments_B_fkey"
  FOREIGN KEY ("B") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherTrainingModuleSession" ADD CONSTRAINT "TeacherTrainingModuleSession_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeacherTrainingModuleSession_teacherTrainingModuleId_membershipId_key"
  ON "TeacherTrainingModuleSession"("teacherTrainingModuleId", "membershipId");
