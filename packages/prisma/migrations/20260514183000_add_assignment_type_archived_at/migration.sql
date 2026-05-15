ALTER TABLE "AssignmentType"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(6);

CREATE INDEX "AssignmentType_archivedAt_idx"
  ON "AssignmentType"("archivedAt");
