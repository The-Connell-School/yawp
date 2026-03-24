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
    "legacySnapshotId" TEXT,

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

-- CreateIndex
CREATE INDEX "Submission_documentId_submittedAt_idx" ON "Submission"("documentId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "Submission_gradedById_idx" ON "Submission"("gradedById");

-- CreateIndex
CREATE INDEX "Submission_releasedAt_idx" ON "Submission"("releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_legacySnapshotId_key" ON "Submission"("legacySnapshotId");

-- CreateIndex
CREATE INDEX "Submission_legacySnapshotId_idx" ON "Submission"("legacySnapshotId");

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
