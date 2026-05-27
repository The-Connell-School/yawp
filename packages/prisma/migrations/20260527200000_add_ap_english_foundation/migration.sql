-- Add kind discriminator to AssignmentType for AP course branching.
-- Existing rows default to "standard"; no data loss.
ALTER TABLE "AssignmentType" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'standard';
CREATE INDEX "AssignmentType_kind_idx" ON "AssignmentType"("kind");

-- Prompt library for AP and future assignment types.
CREATE TABLE "PromptLibraryEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentTypeKind" TEXT NOT NULL,
    "essayType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "promptBody" TEXT NOT NULL,
    "sourcePassages" JSONB,
    "year" INTEGER,
    "tags" JSONB,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,

    CONSTRAINT "PromptLibraryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptLibraryEntry_assignmentTypeKind_essayType_idx"
    ON "PromptLibraryEntry"("assignmentTypeKind", "essayType");

CREATE INDEX "PromptLibraryEntry_createdById_idx"
    ON "PromptLibraryEntry"("createdById");

ALTER TABLE "PromptLibraryEntry"
    ADD CONSTRAINT "PromptLibraryEntry_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Profile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Calibration samples (high/mid/low anchor essays) for GA scoring.
CREATE TABLE "CalibrationSample" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tier" TEXT NOT NULL,
    "essayText" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rubricAnnotations" JSONB,
    "promptLibraryEntryId" TEXT NOT NULL,

    CONSTRAINT "CalibrationSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalibrationSample_promptLibraryEntryId_idx"
    ON "CalibrationSample"("promptLibraryEntryId");

ALTER TABLE "CalibrationSample"
    ADD CONSTRAINT "CalibrationSample_promptLibraryEntryId_fkey"
    FOREIGN KEY ("promptLibraryEntryId") REFERENCES "PromptLibraryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
