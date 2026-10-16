-- CreateTable
CREATE TABLE "InternalApiRequestNonce" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalApiRequestNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalPlatformApiAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorEmail" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" TEXT NOT NULL,

    CONSTRAINT "InternalPlatformApiAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InternalApiRequestNonce_keyId_nonce_key" ON "InternalApiRequestNonce"("keyId", "nonce");

-- CreateIndex
CREATE INDEX "InternalApiRequestNonce_expiresAt_idx" ON "InternalApiRequestNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "InternalPlatformApiAudit_createdAt_idx" ON "InternalPlatformApiAudit"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "InternalPlatformApiAudit_keyId_createdAt_idx" ON "InternalPlatformApiAudit"("keyId", "createdAt" DESC);
