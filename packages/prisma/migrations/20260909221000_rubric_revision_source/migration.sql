ALTER TABLE "RubricRevision"
 ADD COLUMN "sourceContentId" TEXT,
 ADD COLUMN "sourceVersion" INTEGER,
 ADD COLUMN "sourceFingerprint" TEXT,
 ADD CONSTRAINT "RubricRevision_source_complete" CHECK (
   ("sourceContentId" IS NULL AND "sourceVersion" IS NULL AND "sourceFingerprint" IS NULL)
   OR ("sourceContentId" IS NOT NULL AND "sourceVersion" IS NOT NULL AND "sourceVersion" > 0 AND "sourceFingerprint" IS NOT NULL)
 );
