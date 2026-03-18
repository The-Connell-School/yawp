ALTER TABLE "Document"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "DocumentWriteJournal" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "failureReason" TEXT,
  "requestId" TEXT,
  "traceId" TEXT,
  "userId" TEXT,
  "profileId" TEXT,
  "sessionId" TEXT,
  "editorSessionId" TEXT,
  "clientSeq" INTEGER,
  "baseRevision" INTEGER,
  "resultingRevision" INTEGER,
  "documentId" TEXT NOT NULL,
  "title" TEXT,
  "html" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "htmlHash" TEXT NOT NULL,
  "textHash" TEXT NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "DocumentWriteJournal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "requestId" TEXT,
  "traceId" TEXT,
  "route" TEXT,
  "path" TEXT,
  "method" TEXT,
  "statusCode" INTEGER,
  "durationMs" INTEGER,
  "success" BOOLEAN,
  "userId" TEXT,
  "profileId" TEXT,
  "sessionId" TEXT,
  "editorSessionId" TEXT,
  "documentId" TEXT,
  "organizationId" TEXT,
  "classId" TEXT,
  "payload" JSONB,
  "metadata" JSONB,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentWriteJournal_documentId_createdAt_idx"
ON "DocumentWriteJournal"("documentId", "createdAt" DESC);

CREATE INDEX "DocumentWriteJournal_userId_createdAt_idx"
ON "DocumentWriteJournal"("userId", "createdAt" DESC);

CREATE INDEX "DocumentWriteJournal_requestId_idx"
ON "DocumentWriteJournal"("requestId");

CREATE INDEX "DocumentWriteJournal_traceId_idx"
ON "DocumentWriteJournal"("traceId");

CREATE INDEX "DocumentWriteJournal_editorSessionId_clientSeq_idx"
ON "DocumentWriteJournal"("editorSessionId", "clientSeq" DESC);

CREATE INDEX "AuditEvent_createdAt_idx"
ON "AuditEvent"("createdAt" DESC);

CREATE INDEX "AuditEvent_eventType_createdAt_idx"
ON "AuditEvent"("eventType", "createdAt" DESC);

CREATE INDEX "AuditEvent_requestId_idx"
ON "AuditEvent"("requestId");

CREATE INDEX "AuditEvent_traceId_idx"
ON "AuditEvent"("traceId");

CREATE INDEX "AuditEvent_userId_createdAt_idx"
ON "AuditEvent"("userId", "createdAt" DESC);

CREATE INDEX "AuditEvent_documentId_createdAt_idx"
ON "AuditEvent"("documentId", "createdAt" DESC);

ALTER TABLE "DocumentWriteJournal"
ADD CONSTRAINT "DocumentWriteJournal_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
