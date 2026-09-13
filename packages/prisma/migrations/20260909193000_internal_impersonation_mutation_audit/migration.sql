ALTER TABLE "InternalImpersonationEvent"
ADD COLUMN "requestId" TEXT,
ADD COLUMN "requestAction" TEXT,
ADD COLUMN "jobId" TEXT;
CREATE INDEX "InternalImpersonationEvent_requestId_idx" ON "InternalImpersonationEvent"("requestId");
CREATE INDEX "InternalImpersonationEvent_jobId_idx" ON "InternalImpersonationEvent"("jobId");

CREATE FUNCTION "internal_impersonation_mutation_audit"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  session_id TEXT := NULLIF(current_setting('yawp.impersonation.session', true), '');
  actor "InternalImpersonationSession"%ROWTYPE;
  row_value JSONB;
  resource_key JSONB;
  request_id TEXT := NULLIF(current_setting('yawp.impersonation.request', true), '');
  request_action TEXT := NULLIF(current_setting('yawp.impersonation.action', true), '');
BEGIN
  IF session_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  SELECT * INTO actor FROM "InternalImpersonationSession"
  WHERE "id" = session_id AND "endedAt" IS NULL AND "expiresAt" > clock_timestamp();
  IF NOT FOUND OR request_id IS NULL OR request_action IS NULL THEN
    RAISE EXCEPTION 'Active attributed request required';
  END IF;
  IF TG_OP = 'DELETE' THEN row_value := to_jsonb(OLD); ELSE row_value := to_jsonb(NEW); END IF;
  SELECT jsonb_object_agg(a.attname, row_value -> a.attname) INTO resource_key
  FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = TG_RELID AND i.indisprimary;
  -- Prisma implicit many-to-many join tables use a unique A/B pair without a PK.
  IF resource_key IS NULL AND row_value ? 'A' AND row_value ? 'B' THEN
    resource_key := jsonb_build_object('A', row_value -> 'A', 'B', row_value -> 'B');
  END IF;
  IF resource_key IS NULL THEN RAISE EXCEPTION 'Audited resource requires an identity'; END IF;
  INSERT INTO "InternalImpersonationEvent" (
    "id", "sessionId", "actorId", "userId", "organizationId", "action", "resourceType", "resourceId", "requestId", "requestAction", "jobId"
  ) VALUES (
    gen_random_uuid()::text, actor."id", actor."actorId", actor."userId", actor."organizationId",
    CASE TG_OP WHEN 'INSERT' THEN 'row.created' WHEN 'UPDATE' THEN 'row.updated' ELSE 'row.deleted' END,
    TG_TABLE_NAME, resource_key::text, request_id, request_action,
    NULLIF(current_setting('yawp.impersonation.job', true), '')
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DO $$
DECLARE relation RECORD;
BEGIN
  FOR relation IN
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
      AND tablename NOT IN ('_prisma_migrations', 'InternalImpersonationSession', 'InternalImpersonationEvent')
  LOOP
    EXECUTE format('CREATE TRIGGER internal_impersonation_mutation_audit AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit()', current_schema(), relation.tablename);
  END LOOP;
END;
$$;
