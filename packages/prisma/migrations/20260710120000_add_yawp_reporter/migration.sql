-- Organization-level gate for the Yawp Reporter feature (gradual rollout).
ALTER TABLE "Organization"
  ADD COLUMN "reporterEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Yawp Reporter conversations (teacher-owned chat sessions).
CREATE TABLE "ReporterConversation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(6),
  "title" TEXT NOT NULL DEFAULT 'New report',
  "membershipId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "ReporterConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReporterConversation_membershipId_updatedAt_idx"
  ON "ReporterConversation"("membershipId", "updatedAt" DESC);

CREATE INDEX "ReporterConversation_organizationId_idx"
  ON "ReporterConversation"("organizationId");

ALTER TABLE "ReporterConversation"
  ADD CONSTRAINT "ReporterConversation_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReporterConversation"
  ADD CONSTRAINT "ReporterConversation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Yawp Reporter messages (ordered transcript per conversation).
CREATE TABLE "ReporterMessage" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "toolCalls" JSONB,
  "conversationId" TEXT NOT NULL,
  CONSTRAINT "ReporterMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReporterMessage_conversationId_createdAt_idx"
  ON "ReporterMessage"("conversationId", "createdAt");

ALTER TABLE "ReporterMessage"
  ADD CONSTRAINT "ReporterMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ReporterConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
