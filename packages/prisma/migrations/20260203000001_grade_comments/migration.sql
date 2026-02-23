-- CreateTable
CREATE TABLE "GradeComment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "occurrence" INTEGER NOT NULL DEFAULT 1,
    "gradeId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "GradeComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeCommentResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "GradeCommentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeComment_gradeId_createdAt_idx" ON "GradeComment"("gradeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GradeComment_profileId_idx" ON "GradeComment"("profileId");

-- CreateIndex
CREATE INDEX "GradeCommentResponse_commentId_idx" ON "GradeCommentResponse"("commentId");

-- CreateIndex
CREATE INDEX "GradeCommentResponse_profileId_idx" ON "GradeCommentResponse"("profileId");

-- AddForeignKey
ALTER TABLE "GradeComment" ADD CONSTRAINT "GradeComment_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeComment" ADD CONSTRAINT "GradeComment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeCommentResponse" ADD CONSTRAINT "GradeCommentResponse_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "GradeComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeCommentResponse" ADD CONSTRAINT "GradeCommentResponse_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

