-- CreateEnum
CREATE TYPE "AdminConfigAuditSource" AS ENUM ('web_admin', 'internal_api');

-- CreateEnum
CREATE TYPE "AdminConfigAuditEntityType" AS ENUM ('feature_flag', 'access_list');

-- CreateEnum
CREATE TYPE "AdminConfigAuditAction" AS ENUM ('set', 'add', 'remove');

-- CreateTable
CREATE TABLE "AccessListEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listKey" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "AccessListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminConfigAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "source" "AdminConfigAuditSource" NOT NULL,
    "entityType" "AdminConfigAuditEntityType" NOT NULL,
    "entityKey" TEXT NOT NULL,
    "action" "AdminConfigAuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,

    CONSTRAINT "AdminConfigAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessListEntry_listKey_userId_idx" ON "AccessListEntry"("listKey", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessListEntry_listKey_email_key" ON "AccessListEntry"("listKey", "email");

-- CreateIndex
CREATE INDEX "AdminConfigAudit_entityType_entityKey_createdAt_idx" ON "AdminConfigAudit"("entityType", "entityKey", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AccessListEntry" ADD CONSTRAINT "AccessListEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessListEntry" ADD CONSTRAINT "AccessListEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Teacher's Lounge: persisted off + allowlist parity with pre-migration code constants.
INSERT INTO "Setting" ("id", "createdAt", "updatedAt", "name", "description", "value", "valueType")
VALUES (
  'teacher_lounge_feature_flag_seed',
  NOW(),
  NOW(),
  'feature_flag.teacher-lounge',
  'Teacher''s Lounge rollout (off = hidden except access-list bypass)',
  '{"mode":"off","orgIds":[]}',
  'json'
);

INSERT INTO "AccessListEntry" ("id", "listKey", "email", "note")
VALUES
  ('teacher_lounge_allow_zestlan', 'teacher_lounge', 'zestlan.simmons@mps.k12.al.us', 'Migrated from TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS'),
  ('teacher_lounge_allow_eric', 'teacher_lounge', 'eric@theconnellschool.com', 'Migrated from TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS'),
  ('teacher_lounge_allow_chris', 'teacher_lounge', 'christhewriter@mail.com', 'Migrated from TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS');
