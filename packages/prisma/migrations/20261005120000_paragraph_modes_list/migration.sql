-- Every Daily Pages paragraph type an assignment (or a teacher's test
-- document) practices. A prompt often asks for more than one move, so the
-- single `paragraphMode` column becomes a list.
--
-- Additive only. Existing rows get an empty list and keep their single
-- `paragraphMode`, which readers fall back to; both columns are written
-- while readers move over, so nothing changes for work already assigned.
ALTER TABLE "Assignment" ADD COLUMN "paragraphModes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Document" ADD COLUMN "paragraphModes" TEXT[] DEFAULT ARRAY[]::TEXT[];
