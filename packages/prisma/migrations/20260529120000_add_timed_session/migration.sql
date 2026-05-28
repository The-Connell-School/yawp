-- Timed practice sessions for AP essays (exam-condition simulation).
-- One per document; reading-phase lock and clock derive from startedAt.
CREATE TABLE "TimedSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "essayType" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "submittedAt" TIMESTAMPTZ(6),
    "documentId" TEXT NOT NULL,

    CONSTRAINT "TimedSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimedSession_documentId_key" ON "TimedSession"("documentId");

ALTER TABLE "TimedSession"
    ADD CONSTRAINT "TimedSession_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
