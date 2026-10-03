-- The Daily Pages paragraph type a standalone document practices, chosen by a
-- teacher at New → Document to test one type end to end.
--
-- Nullable on purpose: NULL means no type was chosen, so every document that
-- predates this column tutors and grades exactly as it did. Additive only.
ALTER TABLE "Document" ADD COLUMN "paragraphMode" TEXT;
