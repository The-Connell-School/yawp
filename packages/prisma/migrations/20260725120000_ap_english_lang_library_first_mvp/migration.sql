ALTER TABLE "Assignment" ADD COLUMN "apEnglishLangSnapshot" JSONB;

CREATE TABLE "ApEnglishLangPromptLibraryEntry" (
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
    "suggestedEvidence" TEXT,
    "provenanceUrl" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    CONSTRAINT "ApEnglishLangPromptLibraryEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApEnglishLangPromptLibraryEntry_assignmentTypeId_fkey"
      FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApEnglishLangPromptLibrarySource" (
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
    CONSTRAINT "ApEnglishLangPromptLibrarySource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApEnglishLangPromptLibrarySource_promptLibraryEntryId_fkey"
      FOREIGN KEY ("promptLibraryEntryId") REFERENCES "ApEnglishLangPromptLibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApEnglishLangPromptLibraryEntry_externalKey_key"
    ON "ApEnglishLangPromptLibraryEntry"("externalKey");
CREATE INDEX "ApEnglishLangPromptLibraryEntry_assignmentTypeId_frqType_idx"
    ON "ApEnglishLangPromptLibraryEntry"("assignmentTypeId", "frqType");
CREATE INDEX "ApEnglishLangPromptLibraryEntry_archivedAt_idx"
    ON "ApEnglishLangPromptLibraryEntry"("archivedAt");

CREATE UNIQUE INDEX "ApEnglishLangPromptLibrarySource_externalKey_key"
    ON "ApEnglishLangPromptLibrarySource"("externalKey");
CREATE INDEX "ApEnglishLangPromptLibrarySource_promptLibraryEntryId_position_idx"
    ON "ApEnglishLangPromptLibrarySource"("promptLibraryEntryId", "position");
