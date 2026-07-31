ALTER TABLE "Assignment" ADD COLUMN "apEnglishLitSnapshot" JSONB;

CREATE TABLE "ApEnglishLitPromptLibraryEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalKey" TEXT NOT NULL,
    "assignmentTypeId" TEXT NOT NULL,
    "frqType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "focusSkill" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "skillEmphasis" TEXT,
    "defaultTimeMode" TEXT NOT NULL DEFAULT 'untimed',
    "defaultDurationMinutes" INTEGER NOT NULL,
    "suggestedWorks" TEXT,
    "provenanceUrl" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    CONSTRAINT "ApEnglishLitPromptLibraryEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApEnglishLitPromptLibraryEntry_assignmentTypeId_fkey"
      FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApEnglishLitPromptLibrarySource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalKey" TEXT NOT NULL,
    "promptLibraryEntryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'text',
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "provenanceUrl" TEXT,
    CONSTRAINT "ApEnglishLitPromptLibrarySource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApEnglishLitPromptLibrarySource_promptLibraryEntryId_fkey"
      FOREIGN KEY ("promptLibraryEntryId") REFERENCES "ApEnglishLitPromptLibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApEnglishLitPromptLibraryEntry_externalKey_key"
    ON "ApEnglishLitPromptLibraryEntry"("externalKey");
CREATE INDEX "ApEnglishLitPromptLibraryEntry_assignmentTypeId_frqType_idx"
    ON "ApEnglishLitPromptLibraryEntry"("assignmentTypeId", "frqType");
CREATE INDEX "ApEnglishLitPromptLibraryEntry_archivedAt_idx"
    ON "ApEnglishLitPromptLibraryEntry"("archivedAt");

CREATE UNIQUE INDEX "ApEnglishLitPromptLibrarySource_externalKey_key"
    ON "ApEnglishLitPromptLibrarySource"("externalKey");
CREATE INDEX "ApEnglishLitPromptLibrarySource_promptLibraryEntryId_position_idx"
    ON "ApEnglishLitPromptLibrarySource"("promptLibraryEntryId", "position");
