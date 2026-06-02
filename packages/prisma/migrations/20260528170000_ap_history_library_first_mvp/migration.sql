ALTER TABLE "AssignmentType" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "apHistorySnapshot" JSONB;

CREATE UNIQUE INDEX "AssignmentType_systemKey_key" ON "AssignmentType"("systemKey");
CREATE INDEX "AssignmentType_systemKey_idx" ON "AssignmentType"("systemKey");

CREATE TABLE "ApHistoryPromptLibraryEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalKey" TEXT NOT NULL,
    "assignmentTypeId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "essayType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "reasoningSkill" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "skillEmphasis" TEXT,
    "defaultTimeMode" TEXT NOT NULL DEFAULT 'untimed',
    "defaultDurationMinutes" INTEGER NOT NULL,
    "provenanceUrl" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    CONSTRAINT "ApHistoryPromptLibraryEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApHistoryPromptLibraryEntry_assignmentTypeId_fkey"
      FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApHistoryPromptLibrarySource" (
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
    CONSTRAINT "ApHistoryPromptLibrarySource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApHistoryPromptLibrarySource_promptLibraryEntryId_fkey"
      FOREIGN KEY ("promptLibraryEntryId") REFERENCES "ApHistoryPromptLibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApHistoryPromptLibraryEntry_externalKey_key"
    ON "ApHistoryPromptLibraryEntry"("externalKey");
CREATE INDEX "ApHistoryPromptLibraryEntry_assignmentTypeId_essayType_idx"
    ON "ApHistoryPromptLibraryEntry"("assignmentTypeId", "essayType");
CREATE INDEX "ApHistoryPromptLibraryEntry_course_periodNumber_idx"
    ON "ApHistoryPromptLibraryEntry"("course", "periodNumber");
CREATE INDEX "ApHistoryPromptLibraryEntry_archivedAt_idx"
    ON "ApHistoryPromptLibraryEntry"("archivedAt");

CREATE UNIQUE INDEX "ApHistoryPromptLibrarySource_externalKey_key"
    ON "ApHistoryPromptLibrarySource"("externalKey");
CREATE INDEX "ApHistoryPromptLibrarySource_promptLibraryEntryId_position_idx"
    ON "ApHistoryPromptLibrarySource"("promptLibraryEntryId", "position");
