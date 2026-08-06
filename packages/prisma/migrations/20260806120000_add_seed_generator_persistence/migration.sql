-- CreateTable
CREATE TABLE "SeedGeneratorConversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "title" TEXT NOT NULL DEFAULT 'New seed plan',
    "membershipId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "SeedGeneratorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedGeneratorMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "SeedGeneratorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedGeneratorNode" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentLocalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "data" JSONB NOT NULL,
    "committedEntityId" TEXT,

    CONSTRAINT "SeedGeneratorNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeedGeneratorConversation_membershipId_updatedAt_idx" ON "SeedGeneratorConversation"("membershipId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SeedGeneratorConversation_organizationId_idx" ON "SeedGeneratorConversation"("organizationId");

-- CreateIndex
CREATE INDEX "SeedGeneratorMessage_conversationId_createdAt_idx" ON "SeedGeneratorMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SeedGeneratorNode_conversationId_localId_idx" ON "SeedGeneratorNode"("conversationId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedGeneratorNode_conversationId_localId_key" ON "SeedGeneratorNode"("conversationId", "localId");

-- AddForeignKey
ALTER TABLE "SeedGeneratorConversation" ADD CONSTRAINT "SeedGeneratorConversation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedGeneratorConversation" ADD CONSTRAINT "SeedGeneratorConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedGeneratorMessage" ADD CONSTRAINT "SeedGeneratorMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SeedGeneratorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedGeneratorNode" ADD CONSTRAINT "SeedGeneratorNode_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SeedGeneratorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
