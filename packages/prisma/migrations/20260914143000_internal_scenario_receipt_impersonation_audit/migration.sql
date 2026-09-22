-- A database that applied Internal's audit migrations before scenario receipts
-- existed needs these triggers. Fresh databases may already have them from the
-- generic audit sweep, so keep this repair migration idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '"InternalScenarioReceipt"'::regclass
      AND tgname = 'internal_impersonation_mutation_audit'
  ) THEN
    CREATE TRIGGER internal_impersonation_mutation_audit
      AFTER INSERT OR UPDATE OR DELETE ON "InternalScenarioReceipt"
      FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '"InternalScenarioReceipt"'::regclass
      AND tgname = 'internal_impersonation_truncate_guard'
  ) THEN
    CREATE TRIGGER internal_impersonation_truncate_guard
      BEFORE TRUNCATE ON "InternalScenarioReceipt"
      FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard();
  END IF;
END $$;
