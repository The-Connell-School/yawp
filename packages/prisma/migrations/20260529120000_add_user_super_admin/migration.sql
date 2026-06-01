ALTER TABLE "User"
ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "isSuperAdmin" = true,
    "isAdmin" = true
WHERE lower(email) IN (
  'bryant@brock.software',
  'bryantbrock@software'
);
