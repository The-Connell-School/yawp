-- Audit rows remain immutable while their tenant exists. Permit only the
-- database-owned ON DELETE CASCADE path after the parent tenant is gone, so
-- tenant deletion and privacy-erasure workflows cannot be deadlocked by the
-- append-only trigger.
CREATE OR REPLACE FUNCTION prevent_lti_audit_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD."registrationId" IS NOT NULL
    AND NEW."registrationId" IS NULL
    AND NEW."id" = OLD."id"
    AND NEW."organizationId" = OLD."organizationId"
    AND NOT EXISTS (
      SELECT 1 FROM "LtiRegistration" WHERE "id" = OLD."registrationId"
    )
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND NOT EXISTS (
      SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId"
    )
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'LTI audit events are append-only';
END;
$$ LANGUAGE plpgsql;
