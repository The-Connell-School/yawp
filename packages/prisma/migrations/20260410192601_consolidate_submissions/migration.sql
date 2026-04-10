-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL,
    "score" TEXT,
    "feedback" TEXT,
    "rubricScores" JSONB,
    "overallScore" INTEGER,
    "overallComment" TEXT,
    "numericPercentage" INTEGER,
    "letterGrade" TEXT,
    "grammarIssues" JSONB,
    "promptConfig" JSONB,
    "aiMeta" JSONB,
    "gradedAt" TIMESTAMPTZ(6),
    "gradedById" TEXT,
    "releasedAt" TIMESTAMPTZ(6),
    "documentId" TEXT NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionComment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "occurrence" INTEGER NOT NULL DEFAULT 1,
    "submissionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "SubmissionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyGradeRedirect" (
    "gradeId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyGradeRedirect_pkey" PRIMARY KEY ("gradeId")
);

-- CreateIndex
CREATE INDEX "Submission_documentId_submittedAt_idx" ON "Submission"("documentId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "Submission_gradedById_idx" ON "Submission"("gradedById");

-- CreateIndex
CREATE INDEX "Submission_releasedAt_idx" ON "Submission"("releasedAt");

-- CreateIndex
CREATE INDEX "SubmissionComment_submissionId_createdAt_idx" ON "SubmissionComment"("submissionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SubmissionComment_profileId_idx" ON "SubmissionComment"("profileId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionComment" ADD CONSTRAINT "SubmissionComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionComment" ADD CONSTRAINT "SubmissionComment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Submissions from DocumentSnapshot + Grade
INSERT INTO "Submission" (
  id, "createdAt", "updatedAt",
  title, text, html, "submittedAt",
  score, feedback, "rubricScores",
  "overallScore", "overallComment",
  "numericPercentage", "letterGrade",
  "grammarIssues", "promptConfig", "aiMeta",
  "gradedAt", "gradedById", "releasedAt",
  "documentId"
)
SELECT
  s.id,
  s."createdAt",
  COALESCE(g."updatedAt", s."createdAt"),
  COALESCE(d.title, 'Untitled'),
  COALESCE(g."essayText", s.text),
  COALESCE(g."essayHtml", s.html),
  COALESCE(s."submittedAt", s."createdAt"),
  g.score, g.feedback, g."rubricScores",
  g."overallScore", g."overallComment",
  g."numericPercentage", g."letterGrade",
  g."grammarIssues", g."promptConfig", g."aiMeta",
  g."updatedAt", g."gradedById", g."releasedAt",
  s."documentId"
FROM "DocumentSnapshot" s
LEFT JOIN "Grade" g ON g."snapshotId" = s.id
LEFT JOIN "Document" d ON d.id = s."documentId"
WHERE s."archivedAt" IS NULL;

-- Backfill SubmissionComments from GradeComments
INSERT INTO "SubmissionComment" (
  id, "createdAt", "updatedAt",
  content, excerpt, occurrence,
  "submissionId", "profileId"
)
SELECT
  gc.id, gc."createdAt", gc."updatedAt",
  gc.content, gc.excerpt, gc.occurrence,
  g."snapshotId",
  gc."profileId"
FROM "GradeComment" gc
JOIN "Grade" g ON g.id = gc."gradeId"
WHERE g."snapshotId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Submission" sub WHERE sub.id = g."snapshotId");

-- Build legacy redirect table
INSERT INTO "LegacyGradeRedirect" ("gradeId", "submissionId")
SELECT g.id, g."snapshotId"
FROM "Grade" g
WHERE g."snapshotId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Submission" sub WHERE sub.id = g."snapshotId");

-- Drop FK constraint on Document.submittedSnapshotId before dropping DocumentSnapshot
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_submittedSnapshotId_fkey";

-- Drop old columns from Document
ALTER TABLE "Document" DROP COLUMN IF EXISTS "submittedAt";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "submittedSnapshotId";

-- Drop FK constraints referencing old tables
ALTER TABLE "GradeComment" DROP CONSTRAINT IF EXISTS "GradeComment_gradeId_fkey";
ALTER TABLE "Grade" DROP CONSTRAINT IF EXISTS "Grade_snapshotId_fkey";
ALTER TABLE "Grade" DROP CONSTRAINT IF EXISTS "Grade_documentId_fkey";
ALTER TABLE "Grade" DROP CONSTRAINT IF EXISTS "Grade_gradedById_fkey";
ALTER TABLE "GradeCommentResponse" DROP CONSTRAINT IF EXISTS "GradeCommentResponse_commentId_fkey";
ALTER TABLE "GradeCommentResponse" DROP CONSTRAINT IF EXISTS "GradeCommentResponse_profileId_fkey";
ALTER TABLE "GradeComment" DROP CONSTRAINT IF EXISTS "GradeComment_profileId_fkey";
ALTER TABLE "DocumentSnapshot" DROP CONSTRAINT IF EXISTS "DocumentSnapshot_documentId_fkey";

-- Drop old tables (order: dependents first)
DROP TABLE IF EXISTS "GradeCommentResponse";
DROP TABLE IF EXISTS "GradeComment";
DROP TABLE IF EXISTS "Grade";
DROP TABLE IF EXISTS "DocumentSnapshot";
