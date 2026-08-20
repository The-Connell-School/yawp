BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive rollout gate. Recording begins immediately; released-grade editing
-- and staff-facing activity UI remain disabled until this flag is enabled.
ALTER TABLE "Organization"
ADD COLUMN "submissionActivityEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Durable, append-only submission audit history. No historical rows are
-- backfilled because doing so would invent actors and timestamps.
CREATE TABLE "SubmissionActivity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "occurredAfterRelease" BOOLEAN NOT NULL DEFAULT false,
    "changes" JSONB NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "SubmissionActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionActivity_submissionId_createdAt_idx"
ON "SubmissionActivity"("submissionId", "createdAt" DESC);

CREATE INDEX "SubmissionActivity_organizationId_createdAt_idx"
ON "SubmissionActivity"("organizationId", "createdAt" DESC);

CREATE INDEX "SubmissionActivity_actorMembershipId_createdAt_idx"
ON "SubmissionActivity"("actorMembershipId", "createdAt" DESC);

CREATE INDEX "SubmissionActivity_eventType_createdAt_idx"
ON "SubmissionActivity"("eventType", "createdAt" DESC);

ALTER TABLE "SubmissionActivity"
ADD CONSTRAINT "SubmissionActivity_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubmissionActivity"
ADD CONSTRAINT "SubmissionActivity_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubmissionActivity"
ADD CONSTRAINT "SubmissionActivity_actorMembershipId_fkey"
FOREIGN KEY ("actorMembershipId") REFERENCES "OrgMembership"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
