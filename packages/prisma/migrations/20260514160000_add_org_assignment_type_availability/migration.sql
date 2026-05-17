-- CreateTable
CREATE TABLE "OrganizationAssignmentType" (
    "organizationId" TEXT NOT NULL,
    "assignmentTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationAssignmentType_pkey" PRIMARY KEY ("organizationId","assignmentTypeId")
);

-- Backfill existing one-org assignment type visibility into the new many-to-many table.
INSERT INTO "OrganizationAssignmentType" ("organizationId", "assignmentTypeId")
SELECT "ownerOrgId", "id"
FROM "AssignmentType"
WHERE "ownerOrgId" IS NOT NULL
ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING;

-- CreateIndex
CREATE INDEX "OrganizationAssignmentType_assignmentTypeId_idx" ON "OrganizationAssignmentType"("assignmentTypeId");

-- AddForeignKey
ALTER TABLE "OrganizationAssignmentType" ADD CONSTRAINT "OrganizationAssignmentType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAssignmentType" ADD CONSTRAINT "OrganizationAssignmentType_assignmentTypeId_fkey" FOREIGN KEY ("assignmentTypeId") REFERENCES "AssignmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
