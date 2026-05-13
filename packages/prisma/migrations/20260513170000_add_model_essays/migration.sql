-- CreateTable
CREATE TABLE "ModelEssay" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "teachingNotes" TEXT,
    "rhetoricalMove" TEXT,
    "topicCategory" TEXT,
    "part" TEXT,
    "difficulty" TEXT,
    "gradeLevel" INTEGER,
    "assignmentTypeId" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "hiddenAt" TIMESTAMPTZ(6),
    "hiddenBy" TEXT,
    "createdById" TEXT,
    "draftingNotes" TEXT,

    CONSTRAINT "ModelEssay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelEssay_assignmentTypeId_idx" ON "ModelEssay"("assignmentTypeId");

-- CreateIndex
CREATE INDEX "ModelEssay_isHidden_idx" ON "ModelEssay"("isHidden");

-- CreateIndex
CREATE INDEX "ModelEssay_gradeLevel_idx" ON "ModelEssay"("gradeLevel");

-- AddForeignKey
ALTER TABLE "ModelEssay" ADD CONSTRAINT "ModelEssay_assignmentTypeId_fkey" FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEssay" ADD CONSTRAINT "ModelEssay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
