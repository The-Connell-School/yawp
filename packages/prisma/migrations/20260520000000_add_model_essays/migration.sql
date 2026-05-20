CREATE TABLE "ModelEssay" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "essayType" TEXT,
    "part" TEXT,
    "topicCategory" TEXT,
    "gradeLevel" INTEGER,
    "assignmentTypeId" TEXT,
    "moduleId" TEXT,
    "teachingNotes" TEXT,
    "draftingNotes" TEXT,
    "createdById" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "hiddenAt" TIMESTAMPTZ(6),
    "hiddenById" TEXT,

    CONSTRAINT "ModelEssay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelEssay_isHidden_idx" ON "ModelEssay"("isHidden");
CREATE INDEX "ModelEssay_assignmentTypeId_idx" ON "ModelEssay"("assignmentTypeId");
CREATE INDEX "ModelEssay_moduleId_idx" ON "ModelEssay"("moduleId");
CREATE INDEX "ModelEssay_gradeLevel_idx" ON "ModelEssay"("gradeLevel");
CREATE INDEX "ModelEssay_essayType_idx" ON "ModelEssay"("essayType");

ALTER TABLE "ModelEssay"
  ADD CONSTRAINT "ModelEssay_assignmentTypeId_fkey"
  FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModelEssay"
  ADD CONSTRAINT "ModelEssay_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "AssignmentModule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModelEssay"
  ADD CONSTRAINT "ModelEssay_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModelEssay"
  ADD CONSTRAINT "ModelEssay_hiddenById_fkey"
  FOREIGN KEY ("hiddenById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
