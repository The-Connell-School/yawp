SET lock_timeout = '5s';

ALTER TABLE "Assignment" DROP COLUMN IF EXISTS "exitTicketConfigJson";
