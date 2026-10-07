SET lock_timeout = '5s';

-- Lesson Planner conversations (teacher-owned planning sessions).
CREATE TABLE "LessonPlanConversation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(6),
  "title" TEXT NOT NULL DEFAULT 'New lesson',
  "membershipId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "originClassAssignmentId" TEXT,
  CONSTRAINT "LessonPlanConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlanConversation_membershipId_updatedAt_idx"
  ON "LessonPlanConversation"("membershipId", "updatedAt" DESC);

CREATE INDEX "LessonPlanConversation_organizationId_idx"
  ON "LessonPlanConversation"("organizationId");

CREATE INDEX "LessonPlanConversation_originClassAssignmentId_idx"
  ON "LessonPlanConversation"("originClassAssignmentId");

-- Composite membership FK: a conversation can only point at a membership that
-- already belongs to the same organization, so the tenant cannot be crossed.
ALTER TABLE "LessonPlanConversation"
  ADD CONSTRAINT "LessonPlanConversation_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlanConversation"
  ADD CONSTRAINT "LessonPlanConversation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonPlanConversation"
  ADD CONSTRAINT "LessonPlanConversation_originClassAssignmentId_fkey"
  FOREIGN KEY ("originClassAssignmentId") REFERENCES "ClassAssignment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Lesson Planner messages (ordered transcript per conversation).
CREATE TABLE "LessonPlanMessage" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "toolCalls" JSONB,
  "conversationId" TEXT NOT NULL,
  CONSTRAINT "LessonPlanMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPlanMessage_conversationId_createdAt_idx"
  ON "LessonPlanMessage"("conversationId", "createdAt");

ALTER TABLE "LessonPlanMessage"
  ADD CONSTRAINT "LessonPlanMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "LessonPlanConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
