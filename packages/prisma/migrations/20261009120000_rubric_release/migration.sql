-- Platform-side record of the rubric revision Yawp Internal released per
-- catalog key. Read only when the `internal_rubrics` feature flag is on for a
-- school; nothing else changes, so this migration moves no live rubric content
-- and no assignment pin.
CREATE TABLE "RubricRelease" (
    "catalogKey" TEXT NOT NULL,
    "rubricRevisionId" TEXT NOT NULL,
    "releasedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "RubricRelease_pkey" PRIMARY KEY ("catalogKey")
);

CREATE INDEX "RubricRelease_rubricRevisionId_idx" ON "RubricRelease"("rubricRevisionId");

ALTER TABLE "RubricRelease" ADD CONSTRAINT "RubricRelease_rubricRevisionId_fkey" FOREIGN KEY ("rubricRevisionId") REFERENCES "RubricRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
