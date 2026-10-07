SET lock_timeout = '5s';

-- Exit Ticket assignment type bootstrap runs idempotently after deploy via
-- packages/prisma/scripts/seed-exit-ticket-assignment-type.ts (--all-orgs),
-- invoked from migrate-remote.ts and preview deploy tooling. This migration
-- records the rollout checkpoint in _prisma_migrations only.

SELECT 1;
