-- Revoke yawp_admin SELECT on internal-schema relations when that schema exists.
-- Safe on fresh databases: the loop simply does nothing when no grants are present.

DO $$
DECLARE
  grant_row RECORD;
BEGIN
  FOR grant_row IN
    SELECT table_schema, table_name
    FROM information_schema.table_privileges
    WHERE grantee = 'yawp_admin'
      AND privilege_type = 'SELECT'
      AND table_schema = 'internal'
  LOOP
    EXECUTE format(
      'REVOKE SELECT ON %I.%I FROM yawp_admin',
      grant_row.table_schema,
      grant_row.table_name
    );
  END LOOP;

  FOR grant_row IN
    SELECT n.nspname AS table_schema, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', n.oid))) acl ON true
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE r.rolname = 'yawp_admin'
      AND n.nspname = 'internal'
      AND acl.privilege_type = 'SELECT'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE SELECT ON %I.%I FROM yawp_admin',
        grant_row.table_schema,
        grant_row.table_name
      );
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
      WHEN undefined_object THEN
        NULL;
    END;
  END LOOP;
END $$;

-- yawp_internal's read grant on public."Organization" is provisioned with the
-- Internal application database role outside this Yawp platform repository.
