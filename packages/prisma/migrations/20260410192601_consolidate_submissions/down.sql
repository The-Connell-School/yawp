-- Emergency rollback for consolidate_submissions migration.
-- NOT applied automatically. Run manually if needed:
--   psql -d yawp -f down.sql
--
-- This recreates the old tables and backfills from Submission data.
-- Requires a database restore from backup for full fidelity.

-- 1. Recreate old tables
CREATE TABLE IF NOT EXISTS "DocumentSnapshot" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "submittedAt" TIMESTAMPTZ(6),
  "archivedAt" TIMESTAMPTZ(6),
  text TEXT NOT NULL,
  html TEXT NOT NULL,
  title TEXT,
  "documentId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Grade" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  score TEXT,
  feedback TEXT,
  "rubricScores" JSONB,
  "overallScore" INTEGER,
  "overallComment" TEXT,
  "numericPercentage" INTEGER,
  "letterGrade" TEXT,
  "grammarIssues" JSONB,
  "promptConfig" JSONB,
  "aiMeta" JSONB,
  "essayText" TEXT,
  "essayHtml" TEXT,
  "releasedAt" TIMESTAMPTZ(6),
  "documentId" TEXT NOT NULL,
  "snapshotId" TEXT,
  "gradedById" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "GradeComment" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  content TEXT NOT NULL,
  excerpt TEXT,
  occurrence INTEGER NOT NULL DEFAULT 1,
  "gradeId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "GradeCommentResponse" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  content TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL
);

-- 2. Re-add columns to Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ(6);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "submittedSnapshotId" TEXT;

-- 3. Backfill DocumentSnapshot from Submission
INSERT INTO "DocumentSnapshot" (id, "createdAt", "submittedAt", text, html, title, "documentId")
SELECT id, "createdAt", "submittedAt", text, html, title, "documentId"
FROM "Submission";

-- 4. Backfill Grade from Submission (only graded submissions)
INSERT INTO "Grade" (
  id, "createdAt", "updatedAt", score, feedback, "rubricScores",
  "overallScore", "overallComment", "numericPercentage", "letterGrade",
  "grammarIssues", "promptConfig", "aiMeta", "essayText", "essayHtml",
  "releasedAt", "documentId", "snapshotId", "gradedById"
)
SELECT
  gen_random_uuid()::text, "createdAt", "updatedAt", score, feedback, "rubricScores",
  "overallScore", "overallComment", "numericPercentage", "letterGrade",
  "grammarIssues", "promptConfig", "aiMeta", text, html,
  "releasedAt", "documentId", id, "gradedById"
FROM "Submission"
WHERE "gradedAt" IS NOT NULL AND "gradedById" IS NOT NULL;

-- 5. Backfill GradeComment from SubmissionComment
INSERT INTO "GradeComment" (id, "createdAt", "updatedAt", content, excerpt, occurrence, "gradeId", "profileId")
SELECT sc.id, sc."createdAt", sc."updatedAt", sc.content, sc.excerpt, sc.occurrence, g.id, sc."profileId"
FROM "SubmissionComment" sc
JOIN "Submission" s ON s.id = sc."submissionId"
JOIN "Grade" g ON g."snapshotId" = s.id;

-- 6. Re-link Document.submittedSnapshotId to latest snapshot
UPDATE "Document" d
SET "submittedAt" = s."submittedAt",
    "submittedSnapshotId" = s.id
FROM (
  SELECT DISTINCT ON ("documentId") id, "documentId", "submittedAt"
  FROM "DocumentSnapshot"
  ORDER BY "documentId", "submittedAt" DESC
) s
WHERE d.id = s."documentId";

-- 7. Add FK constraints back
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"(id) ON DELETE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_submittedSnapshotId_fkey"
  FOREIGN KEY ("submittedSnapshotId") REFERENCES "DocumentSnapshot"(id) ON DELETE SET NULL;

-- Note: This rollback provides approximate data recovery.
-- For full fidelity (exact IDs, timestamps), restore from the pre-migration backup.
