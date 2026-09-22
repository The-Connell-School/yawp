CREATE TABLE "InternalScenarioReceipt" (
 "jobId" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "targetId" TEXT NOT NULL,
 "environment" TEXT NOT NULL CHECK ("environment" IN ('preview','demo')),
 "organizationId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "resources" JSONB NOT NULL, "receipt" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "retiredAt" TIMESTAMPTZ, "retiredByJobId" TEXT,
 CHECK (("retiredAt" IS NULL) = ("retiredByJobId" IS NULL))
);
CREATE INDEX "InternalScenarioReceipt_targetId_organizationId_retiredAt_idx" ON "InternalScenarioReceipt" ("targetId", "organizationId", "retiredAt");
CREATE FUNCTION protect_internal_scenario_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Scenario receipts are durable'; END IF;
 IF (to_jsonb(NEW) - 'retiredAt' - 'retiredByJobId') IS DISTINCT FROM (to_jsonb(OLD) - 'retiredAt' - 'retiredByJobId')
    OR OLD."retiredAt" IS NOT NULL OR NEW."retiredAt" IS NULL THEN
   RAISE EXCEPTION 'Scenario receipt provenance is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "InternalScenarioReceipt_guard" BEFORE UPDATE OR DELETE ON "InternalScenarioReceipt" FOR EACH ROW EXECUTE FUNCTION protect_internal_scenario_receipt();
CREATE TRIGGER "InternalScenarioReceipt_no_truncate" BEFORE TRUNCATE ON "InternalScenarioReceipt" FOR EACH STATEMENT EXECUTE FUNCTION protect_internal_scenario_receipt();
