-- Idempotent repair for preview DBs that recorded 20261007193000_user_handle_accounts
-- before the Class.studentJoinToken / Invitation.studentClassId DDL landed.

ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "studentJoinToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Class_studentJoinToken_key" ON "Class"("studentJoinToken");

UPDATE "Class" c
SET "studentJoinToken" = replace(gen_random_uuid()::text, '-', '')
FROM "School" s
JOIN "Organization" o ON s."organizationId" = o.id
WHERE c."schoolId" = s.id
  AND o.plan = 'FREE_CLASSROOM'
  AND c."studentJoinToken" IS NULL;

ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "studentClassId" TEXT;

CREATE INDEX IF NOT EXISTS "Invitation_type_studentClassId_idx"
  ON "Invitation" ("type", "studentClassId");
