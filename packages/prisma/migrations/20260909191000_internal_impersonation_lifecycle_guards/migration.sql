-- Attribution and lifetime cannot be reassigned after a session is issued.
CREATE FUNCTION "internal_impersonation_identity_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."cookieTokenHash", NEW."actorId", NEW."userId", NEW."organizationId", NEW."membershipId", NEW."createdAt", NEW."expiresAt")
    IS DISTINCT FROM ROW(OLD."id", OLD."cookieTokenHash", OLD."actorId", OLD."userId", OLD."organizationId", OLD."membershipId", OLD."createdAt", OLD."expiresAt")
    OR (OLD."endedAt" IS NOT NULL AND NEW."endedAt" IS DISTINCT FROM OLD."endedAt") THEN
    RAISE EXCEPTION 'Impersonation attribution and lifetime are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "internal_impersonation_identity_immutable"
BEFORE UPDATE ON "InternalImpersonationSession"
FOR EACH ROW EXECUTE FUNCTION "internal_impersonation_identity_immutable"();

-- Deferred checks allow state and its audit event to be written in either order
-- inside one transaction. A partial write cannot commit.
CREATE FUNCTION "internal_impersonation_lifecycle_audited"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE required_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."endedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Impersonation cannot begin already ended';
    END IF;
    required_action := 'session.started';
  ELSIF OLD."endedAt" IS NULL AND NEW."endedAt" IS NOT NULL THEN
    required_action := 'session.ended';
  ELSE
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "InternalImpersonationEvent" e
    WHERE e."sessionId" = NEW."id" AND e."actorId" = NEW."actorId"
      AND e."userId" = NEW."userId" AND e."organizationId" = NEW."organizationId"
      AND e."action" = required_action
      AND e."resourceType" = 'InternalImpersonationSession' AND e."resourceId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Impersonation lifecycle requires matching audit';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "internal_impersonation_lifecycle_audited"
AFTER INSERT OR UPDATE ON "InternalImpersonationSession"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "internal_impersonation_lifecycle_audited"();

CREATE FUNCTION "internal_impersonation_audit_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Impersonation audit is append-only';
END;
$$;
CREATE TRIGGER "internal_impersonation_audit_append_only"
BEFORE UPDATE OR DELETE ON "InternalImpersonationEvent"
FOR EACH ROW EXECUTE FUNCTION "internal_impersonation_audit_append_only"();
