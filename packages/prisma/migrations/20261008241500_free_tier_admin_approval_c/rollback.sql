SET lock_timeout = '5s';

ALTER TABLE "FreeTierApplication"
  DROP COLUMN IF EXISTS "adminRedirectCount",
  DROP COLUMN IF EXISTS "teacherPersonalNote";

DROP TABLE IF EXISTS "FreeTierEmailLog";
DROP TABLE IF EXISTS "FreeTierAdminApproval";
DROP TABLE IF EXISTS "FreeTierSignedLink";

DROP TYPE IF EXISTS "FreeTierSignedLinkPurpose";
DROP TYPE IF EXISTS "FreeTierAdminApprovalStatus";

RESET lock_timeout;
