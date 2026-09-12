-- A database that applied Internal's audit migrations before the shipping image
-- table arrived needs these triggers. Fresh databases already have them because
-- the generic audit migrations run after DocumentImage's original migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '"DocumentImage"'::regclass
      AND tgname = 'internal_impersonation_mutation_audit'
  ) THEN
    CREATE TRIGGER internal_impersonation_mutation_audit
      AFTER INSERT OR UPDATE OR DELETE ON "DocumentImage"
      FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '"DocumentImage"'::regclass
      AND tgname = 'internal_impersonation_truncate_guard'
  ) THEN
    CREATE TRIGGER internal_impersonation_truncate_guard
      BEFORE TRUNCATE ON "DocumentImage"
      FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard();
  END IF;
END $$;
