ALTER TYPE "DocumentArtifactKind" ADD VALUE 'teacher-assignment-preview';

ALTER TABLE "Document"
  ADD COLUMN "teacherPreviewClassAssignmentId" TEXT;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_teacherPreviewClassAssignmentId_fkey"
  FOREIGN KEY ("teacherPreviewClassAssignmentId")
  REFERENCES "ClassAssignment"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "Document_teacherPreviewClassAssignmentId_idx"
  ON "Document"("teacherPreviewClassAssignmentId");
