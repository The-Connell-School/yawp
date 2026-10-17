-- The tour table is introduced after the original audit trigger installation.
CREATE TRIGGER internal_impersonation_mutation_audit
  AFTER INSERT OR UPDATE OR DELETE ON "UserTour"
  FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit();

CREATE TRIGGER internal_impersonation_truncate_guard
  BEFORE TRUNCATE ON "UserTour"
  FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard();
