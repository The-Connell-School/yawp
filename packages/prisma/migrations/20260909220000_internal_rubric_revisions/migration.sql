CREATE TABLE "RubricRevision" (
 "id" TEXT PRIMARY KEY, "rubricName" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0),
 "schemaJson" JSONB NOT NULL, "fingerprint" TEXT NOT NULL, "requestId" TEXT NOT NULL UNIQUE,
 "requestHash" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("rubricName", "version")
);
ALTER TABLE "Rubric" ADD COLUMN "currentRevisionId" TEXT REFERENCES "RubricRevision"("id") ON DELETE RESTRICT;
ALTER TABLE "Assignment" ADD COLUMN "rubricRevisionId" TEXT REFERENCES "RubricRevision"("id") ON DELETE RESTRICT;
CREATE TRIGGER rubric_revision_immutable BEFORE UPDATE OR DELETE ON "RubricRevision"
FOR EACH ROW EXECUTE FUNCTION internal_impersonation_audit_append_only();
CREATE TRIGGER rubric_revision_no_truncate BEFORE TRUNCATE ON "RubricRevision"
FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_audit_append_only();
CREATE TRIGGER internal_impersonation_mutation_audit AFTER INSERT OR UPDATE OR DELETE ON "RubricRevision"
FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit();
CREATE TRIGGER internal_impersonation_truncate_guard BEFORE TRUNCATE ON "RubricRevision"
FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard();

CREATE FUNCTION internal_assignment_rubric_pin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_revision TEXT; selected_name TEXT;
BEGIN
 IF TG_OP = 'UPDATE' AND OLD."rubricRevisionId" IS NOT NULL THEN
   IF NEW."rubricRevisionId" IS DISTINCT FROM OLD."rubricRevisionId" OR NEW."assignmentTypeId" IS DISTINCT FROM OLD."assignmentTypeId" THEN
     RAISE EXCEPTION 'Assignment rubric pin is immutable';
   END IF;
   RETURN NEW;
 END IF;
 SELECT r."currentRevisionId", r.name INTO current_revision, selected_name
 FROM "AssignmentType" t JOIN "Rubric" r ON t."rubricId" = r.id
 WHERE t.id = NEW."assignmentTypeId" FOR SHARE OF r, t;
 IF NEW."rubricRevisionId" IS NULL THEN NEW."rubricRevisionId" := current_revision;
 ELSE
   IF NOT EXISTS (SELECT 1 FROM "RubricRevision" WHERE id = NEW."rubricRevisionId" AND "rubricName" = selected_name) THEN
     RAISE EXCEPTION 'Assignment rubric pin does not match its rubric';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_assignment_rubric_pin BEFORE INSERT OR UPDATE ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION internal_assignment_rubric_pin();

CREATE FUNCTION internal_rubric_revision_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."currentRevisionId" IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM "RubricRevision" WHERE id = NEW."currentRevisionId" AND "rubricName" = NEW.name) THEN
   RAISE EXCEPTION 'Current revision does not match rubric identity';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER internal_rubric_revision_identity BEFORE INSERT OR UPDATE ON "Rubric"
FOR EACH ROW EXECUTE FUNCTION internal_rubric_revision_identity();
