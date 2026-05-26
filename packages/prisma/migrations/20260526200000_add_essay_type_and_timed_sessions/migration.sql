-- Add essayType to AssignmentType so the system can distinguish LEQ/DBQ
-- from standard essays. Nullable — existing assignment types keep NULL.
ALTER TABLE "AssignmentType" ADD COLUMN "essayType" TEXT;

-- Add timedDurationMinutes to Assignment so teachers can set a timed mode
-- per assignment. NULL means untimed.
ALTER TABLE "Assignment" ADD COLUMN "timedDurationMinutes" INT;

-- TimedSession tracks a student's timed writing session on a specific document.
-- For LEQ: single-phase (writing only), default 40 minutes.
-- For DBQ: two-phase (reading 15 min + writing 45 min) — added later.
CREATE TABLE "TimedSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'writing',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMinutes" INT NOT NULL DEFAULT 40,
    "submittedAt" TIMESTAMPTZ(6),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TimedSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimedSession_documentId_key" ON "TimedSession"("documentId");
CREATE INDEX "TimedSession_phase_idx" ON "TimedSession"("phase");

ALTER TABLE "TimedSession" ADD CONSTRAINT "TimedSession_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
