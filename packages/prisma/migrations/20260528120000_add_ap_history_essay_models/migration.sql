-- AlterTable: AssignmentType — add AP History essay fields
ALTER TABLE "AssignmentType" ADD COLUMN "essayType" TEXT;
ALTER TABLE "AssignmentType" ADD COLUMN "period" TEXT;
ALTER TABLE "AssignmentType" ADD COLUMN "reasoningSkill" TEXT;
ALTER TABLE "AssignmentType" ADD COLUMN "defaultTimedMode" TEXT;
ALTER TABLE "AssignmentType" ADD COLUMN "defaultDurationMinutes" INTEGER;

CREATE INDEX "AssignmentType_essayType_idx" ON "AssignmentType"("essayType");

-- AlterTable: Assignment — add timed mode and coaching fields
ALTER TABLE "Assignment" ADD COLUMN "timedMode" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "Assignment" ADD COLUMN "coachingScope" TEXT;

-- CreateTable: SourceDocument
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'text',
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "position" INTEGER NOT NULL,
    "assignmentTypeId" TEXT NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceDocument_assignmentTypeId_position_idx"
    ON "SourceDocument"("assignmentTypeId", "position");

ALTER TABLE "SourceDocument"
    ADD CONSTRAINT "SourceDocument_assignmentTypeId_fkey"
    FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: TimedSession
CREATE TABLE "TimedSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phase" TEXT NOT NULL DEFAULT 'writing',
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "phaseTransitions" JSONB,
    "submittedAt" TIMESTAMPTZ(6),
    "documentId" TEXT NOT NULL,

    CONSTRAINT "TimedSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimedSession_documentId_idx" ON "TimedSession"("documentId");

ALTER TABLE "TimedSession"
    ADD CONSTRAINT "TimedSession_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: TutorSession
CREATE TABLE "TutorSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "essayType" TEXT NOT NULL,
    "currentPhase" TEXT NOT NULL DEFAULT 'source-analysis',
    "coachingScope" TEXT NOT NULL DEFAULT 'full',
    "detectorsFired" JSONB,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TutorSession_documentId_idx" ON "TutorSession"("documentId");

ALTER TABLE "TutorSession"
    ADD CONSTRAINT "TutorSession_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: TutorMessage
CREATE TABLE "TutorMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "phase" TEXT,
    "tutorSessionId" TEXT NOT NULL,

    CONSTRAINT "TutorMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TutorMessage_tutorSessionId_createdAt_idx"
    ON "TutorMessage"("tutorSessionId", "createdAt");

ALTER TABLE "TutorMessage"
    ADD CONSTRAINT "TutorMessage_tutorSessionId_fkey"
    FOREIGN KEY ("tutorSessionId") REFERENCES "TutorSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ContextBankEntry
CREATE TABLE "ContextBankEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dateOrRange" TEXT NOT NULL,

    CONSTRAINT "ContextBankEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContextBankEntry_period_periodNumber_idx"
    ON "ContextBankEntry"("period", "periodNumber");

-- CreateTable: PromptLibraryEntry
CREATE TABLE "PromptLibraryEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "essayType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodNumber" INTEGER,
    "reasoningSkill" TEXT,
    "difficulty" TEXT,
    "promptBody" TEXT NOT NULL,

    CONSTRAINT "PromptLibraryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptLibraryEntry_essayType_period_idx"
    ON "PromptLibraryEntry"("essayType", "period");

CREATE INDEX "PromptLibraryEntry_difficulty_idx"
    ON "PromptLibraryEntry"("difficulty");

-- CreateTable: PromptLibrarySource
CREATE TABLE "PromptLibrarySource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'text',
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "position" INTEGER NOT NULL,
    "promptLibraryEntryId" TEXT NOT NULL,

    CONSTRAINT "PromptLibrarySource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptLibrarySource_promptLibraryEntryId_position_idx"
    ON "PromptLibrarySource"("promptLibraryEntryId", "position");

ALTER TABLE "PromptLibrarySource"
    ADD CONSTRAINT "PromptLibrarySource_promptLibraryEntryId_fkey"
    FOREIGN KEY ("promptLibraryEntryId") REFERENCES "PromptLibraryEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
