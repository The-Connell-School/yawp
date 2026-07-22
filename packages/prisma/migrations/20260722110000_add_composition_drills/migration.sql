ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "compositionDrillsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WritingPracticeAttempt"
ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "responseDigest" TEXT;

DROP INDEX IF EXISTS "WritingPracticeAttempt_classAssignmentId_membershipId_position_key";

ALTER TABLE "WritingPracticeAttempt"
ADD CONSTRAINT "WritingPracticeAttempt_revision_positive_check"
CHECK ("revision" > 0);

CREATE UNIQUE INDEX IF NOT EXISTS "writing_attempt_position_revision_uq"
ON "WritingPracticeAttempt"("classAssignmentId", "membershipId", "position", "revision");

CREATE UNIQUE INDEX IF NOT EXISTS "writing_attempt_position_digest_uq"
ON "WritingPracticeAttempt"("classAssignmentId", "membershipId", "position", "responseDigest");

COMMENT ON COLUMN "Organization"."compositionDrillsEnabled" IS
'Default-off tenant gate for the bounded constructed-response Composition Drills slice.';

COMMENT ON COLUMN "WritingPracticeAttempt"."responseDigest" IS
'SHA-256 retry key only; never contains the raw student response.';
