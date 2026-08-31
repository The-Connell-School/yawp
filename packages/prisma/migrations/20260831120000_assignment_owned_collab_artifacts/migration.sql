-- Phase 1: add the artifact discriminator in a short schema-only migration.
SET lock_timeout = '5s';
SET statement_timeout = '2min';

CREATE TYPE "DocumentArtifactKind" AS ENUM ('student', 'assignment-group');

ALTER TABLE "Document"
  ADD COLUMN "artifactKind" "DocumentArtifactKind" NOT NULL DEFAULT 'student',
  ALTER COLUMN "membershipId" DROP NOT NULL;
