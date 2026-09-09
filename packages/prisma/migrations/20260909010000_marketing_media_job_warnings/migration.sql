-- A SUCCEEDED render can still have degraded: the framing stage may time out
-- and deliver the bare capture. Nullable and additive, so existing rows and
-- any worker that does not write it are unaffected.
ALTER TABLE "MarketingMediaJob" ADD COLUMN "warnings" JSONB;
