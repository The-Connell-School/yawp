CREATE TABLE "WritingPracticeAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classAssignmentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "lessonSlug" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "feedbackJson" JSONB NOT NULL,

    CONSTRAINT "WritingPracticeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WritingPracticePromptSet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classAssignmentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "promptsJson" JSONB NOT NULL,

    CONSTRAINT "WritingPracticePromptSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WritingPracticeAttempt_classAssignmentId_membershipId_creat_idx"
ON "WritingPracticeAttempt"("classAssignmentId", "membershipId", "createdAt" DESC);

CREATE INDEX "WritingPracticeAttempt_membershipId_createdAt_idx"
ON "WritingPracticeAttempt"("membershipId", "createdAt" DESC);

CREATE UNIQUE INDEX "WritingPracticePromptSet_classAssignmentId_membershipId_key"
ON "WritingPracticePromptSet"("classAssignmentId", "membershipId");

ALTER TABLE "WritingPracticeAttempt"
ADD CONSTRAINT "WritingPracticeAttempt_classAssignmentId_fkey"
FOREIGN KEY ("classAssignmentId") REFERENCES "WritingPracticeClassAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WritingPracticeAttempt"
ADD CONSTRAINT "WritingPracticeAttempt_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WritingPracticePromptSet"
ADD CONSTRAINT "WritingPracticePromptSet_classAssignmentId_fkey"
FOREIGN KEY ("classAssignmentId") REFERENCES "WritingPracticeClassAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WritingPracticePromptSet"
ADD CONSTRAINT "WritingPracticePromptSet_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
