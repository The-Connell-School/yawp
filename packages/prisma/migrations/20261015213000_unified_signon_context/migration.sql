CREATE TABLE "SignonFlow" (
  "id" TEXT NOT NULL,
  "browserHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "data" JSONB NOT NULL,
  CONSTRAINT "SignonFlow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SignonFlow_expiresAt_idx" ON "SignonFlow"("expiresAt");
CREATE TABLE "SignonIdentity" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignonIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignonIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SignonIdentity_provider_subject_key" ON "SignonIdentity"("provider", "subject");
CREATE UNIQUE INDEX "SignonIdentity_provider_userId_key" ON "SignonIdentity"("provider", "userId");
