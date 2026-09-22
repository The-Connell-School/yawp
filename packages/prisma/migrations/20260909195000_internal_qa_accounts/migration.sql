CREATE TABLE "InternalQaFixture" (
  "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "reason" TEXT NOT NULL, "users" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMPTZ(6), "archivedBy" TEXT,
  CONSTRAINT "InternalQaFixture_archive_pair" CHECK (("archivedAt" IS NULL) = ("archivedBy" IS NULL))
);
CREATE INDEX "InternalQaFixture_organizationId_createdAt_idx" ON "InternalQaFixture"("organizationId", "createdAt");
CREATE FUNCTION "internal_qa_provenance_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'QA provenance cannot be deleted'; END IF;
  IF (NEW.id, NEW."actorId", NEW."organizationId", NEW."requestHash", NEW.reason, NEW.users, NEW."createdAt")
      IS DISTINCT FROM (OLD.id, OLD."actorId", OLD."organizationId", OLD."requestHash", OLD.reason, OLD.users, OLD."createdAt")
    OR (OLD."archivedAt" IS NOT NULL AND (NEW."archivedAt", NEW."archivedBy") IS DISTINCT FROM (OLD."archivedAt", OLD."archivedBy"))
  THEN RAISE EXCEPTION 'QA provenance is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER internal_qa_provenance_immutable BEFORE UPDATE OR DELETE ON "InternalQaFixture"
FOR EACH ROW EXECUTE FUNCTION internal_qa_provenance_immutable();
CREATE TRIGGER internal_qa_no_truncate BEFORE TRUNCATE ON "InternalQaFixture"
FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_audit_append_only();
CREATE TRIGGER internal_impersonation_mutation_audit AFTER INSERT OR UPDATE OR DELETE ON "InternalQaFixture"
FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit();
CREATE TRIGGER internal_impersonation_truncate_guard BEFORE TRUNCATE ON "InternalQaFixture"
FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard();
