CREATE TABLE "InternalImpersonationSession" (
    "id" TEXT NOT NULL,
    "cookieTokenHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "endedAt" TIMESTAMPTZ(6),
    "remoteEndPending" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "InternalImpersonationSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InternalImpersonationSession_hash_check" CHECK ("cookieTokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "InternalImpersonationSession_cookieTokenHash_key" ON "InternalImpersonationSession"("cookieTokenHash");
CREATE INDEX "InternalImpersonationSession_remoteEndPending_createdAt_idx" ON "InternalImpersonationSession"("remoteEndPending", "createdAt");

CREATE TABLE "InternalImpersonationEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalImpersonationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalImpersonationEvent_sessionId_createdAt_idx" ON "InternalImpersonationEvent"("sessionId", "createdAt");
CREATE INDEX "InternalImpersonationEvent_organizationId_createdAt_idx" ON "InternalImpersonationEvent"("organizationId", "createdAt");
