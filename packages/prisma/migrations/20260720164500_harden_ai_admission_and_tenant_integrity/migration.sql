SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE TABLE "AiRequestReservation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "feature" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "AiRequestReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRequestReservation_membershipId_feature_createdAt_idx"
  ON "AiRequestReservation"("membershipId", "feature", "createdAt" DESC);
CREATE INDEX "AiRequestReservation_organizationId_feature_createdAt_idx"
  ON "AiRequestReservation"("organizationId", "feature", "createdAt" DESC);

ALTER TABLE "AiRequestReservation"
  ADD CONSTRAINT "AiRequestReservation_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AiRequestReservation_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_class_insight_tenant()
RETURNS trigger AS $$
DECLARE
  member_org TEXT;
  class_org TEXT;
BEGIN
  IF NEW."generatedByMembershipId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "organizationId" INTO member_org
  FROM "OrgMembership" WHERE "id" = NEW."generatedByMembershipId";

  SELECT school."organizationId"
    INTO class_org
  FROM "ClassAssignment" deployment
  JOIN "Class" class_row ON class_row."id" = deployment."classId"
  JOIN "School" school ON school."id" = class_row."schoolId"
  WHERE deployment."id" = NEW."classAssignmentId";

  IF member_org IS DISTINCT FROM class_org THEN
    RAISE EXCEPTION 'cross-organization class insight';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClassAssignmentInsight_tenant_check"
BEFORE INSERT OR UPDATE OF "classAssignmentId", "generatedByMembershipId"
ON "ClassAssignmentInsight"
FOR EACH ROW EXECUTE FUNCTION enforce_class_insight_tenant();
