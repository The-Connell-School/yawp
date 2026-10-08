-- Revisions: a job can be written by revising another render's storyboard
-- from operator feedback. The link is advisory; deleting the parent keeps
-- the revision.
ALTER TABLE "MarketingMediaJob" ADD COLUMN "parentJobId" TEXT;

ALTER TABLE "MarketingMediaJob"
  ADD CONSTRAINT "MarketingMediaJob_parentJobId_fkey"
  FOREIGN KEY ("parentJobId") REFERENCES "MarketingMediaJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MarketingMediaJob_parentJobId_idx" ON "MarketingMediaJob"("parentJobId");
