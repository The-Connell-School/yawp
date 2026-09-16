BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive rollout gate for the ungraded dropdown and previous/next
-- arrows beside the name in the grading header. Off by default, so every
-- existing organization keeps today's header until the new control has been
-- verified in production.
ALTER TABLE "Organization"
ADD COLUMN "gradingQueueNavEnabled" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
