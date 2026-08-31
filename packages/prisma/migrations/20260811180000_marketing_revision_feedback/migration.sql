-- What the operator asked to change about the parent take. Kept so the job
-- page can show the request next to what the revision actually changed;
-- without it a revision that ignored the notes is indistinguishable from one
-- that followed them. Nullable: every job that predates this has no request,
-- and a first take never has one.
ALTER TABLE "MarketingMediaJob" ADD COLUMN "revisionFeedback" TEXT;
