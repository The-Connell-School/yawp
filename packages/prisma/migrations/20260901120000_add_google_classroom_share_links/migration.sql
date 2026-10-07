BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive rollout gate for the Google Classroom integration. Off by default:
-- every existing organization keeps today's behaviour (no share control, no
-- share links) until the flow has been verified in production.
ALTER TABLE "Organization"
ADD COLUMN "googleClassroomEnabled" BOOLEAN NOT NULL DEFAULT false;

-- One revocable share link per class assignment. Purely additive: no existing
-- read or write path touches this table.
CREATE TABLE "ClassAssignmentShareLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classAssignmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google-classroom',
    "createdByMembershipId" TEXT,
    "revokedAt" TIMESTAMPTZ(6),
    "lastLaunchedAt" TIMESTAMPTZ(6),
    "launchCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClassAssignmentShareLink_pkey" PRIMARY KEY ("id")
);

-- One live link per assignment: rotation and revocation both mutate this row,
-- so a superseded URL can never be resurrected by a second row.
CREATE UNIQUE INDEX "ClassAssignmentShareLink_classAssignmentId_key"
ON "ClassAssignmentShareLink"("classAssignmentId");

-- Launch resolves by token on every student click; it must be a unique lookup.
CREATE UNIQUE INDEX "ClassAssignmentShareLink_token_key"
ON "ClassAssignmentShareLink"("token");

CREATE INDEX "ClassAssignmentShareLink_createdByMembershipId_idx"
ON "ClassAssignmentShareLink"("createdByMembershipId");

CREATE INDEX "ClassAssignmentShareLink_revokedAt_idx"
ON "ClassAssignmentShareLink"("revokedAt");

ALTER TABLE "ClassAssignmentShareLink"
ADD CONSTRAINT "ClassAssignmentShareLink_classAssignmentId_fkey"
FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: removing a teacher must not take their class's
-- live Classroom links down with them mid-unit.
ALTER TABLE "ClassAssignmentShareLink"
ADD CONSTRAINT "ClassAssignmentShareLink_createdByMembershipId_fkey"
FOREIGN KEY ("createdByMembershipId") REFERENCES "OrgMembership"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
