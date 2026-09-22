-- Per-assignment-type opt-in for student-uploaded figures. Defaults false, so
-- every assignment type that exists today is unchanged.
ALTER TABLE "AssignmentType"
    ADD COLUMN "allowsImageUploads" BOOLEAN NOT NULL DEFAULT false;

-- Turn it on for GBA 300's International Expansion Plan, the course that asked
-- for the feature. Production's row carries its rubric inline as JSON with no
-- linked Rubric row and no systemKey, so the id is the only stable handle. A
-- deploy where that row is absent applies this as a no-op.
UPDATE "AssignmentType"
SET "allowsImageUploads" = true
WHERE "id" = 'cmnt1bliz0l610qk0r09ug5u6';
