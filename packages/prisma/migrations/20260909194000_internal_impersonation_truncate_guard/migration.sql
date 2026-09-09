CREATE FUNCTION "internal_impersonation_truncate_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'InternalImpersonationEvent'
    OR NULLIF(current_setting('yawp.impersonation.session', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Truncation cannot preserve impersonation audit';
  END IF;
  RETURN NULL;
END;
$$;
DO $$
DECLARE relation RECORD;
BEGIN
  FOR relation IN SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('CREATE TRIGGER internal_impersonation_truncate_guard BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard()', current_schema(), relation.tablename);
  END LOOP;
END;
$$;
