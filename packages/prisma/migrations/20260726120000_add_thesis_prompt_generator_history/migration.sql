-- CreateTable
CREATE TABLE "ThesisPromptGeneratorConversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "membershipId" TEXT NOT NULL,

    CONSTRAINT "ThesisPromptGeneratorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisPromptGeneratorTurn" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "options" JSONB,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "ThesisPromptGeneratorTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThesisPromptGeneratorConversation_membershipId_updatedAt_idx" ON "ThesisPromptGeneratorConversation"("membershipId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ThesisPromptGeneratorTurn_conversationId_createdAt_idx" ON "ThesisPromptGeneratorTurn"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ThesisPromptGeneratorConversation" ADD CONSTRAINT "ThesisPromptGeneratorConversation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisPromptGeneratorTurn" ADD CONSTRAINT "ThesisPromptGeneratorTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ThesisPromptGeneratorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
