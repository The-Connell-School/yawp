-- A rubric as one portable object, shared by any number of assignment types.
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "schemaJson" JSONB NOT NULL,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Rubric_name_key" ON "Rubric"("name");
CREATE INDEX "Rubric_title_idx" ON "Rubric"("title");

-- Nullable: an assignment type with no library rubric keeps grading exactly as
-- it did, from its own JSON columns or the built-in default for its kind.
ALTER TABLE "AssignmentType" ADD COLUMN "rubricId" TEXT;

ALTER TABLE "AssignmentType"
    ADD CONSTRAINT "AssignmentType_rubricId_fkey"
    FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssignmentType_rubricId_idx" ON "AssignmentType"("rubricId");
