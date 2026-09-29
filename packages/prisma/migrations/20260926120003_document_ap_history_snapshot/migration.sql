-- Student self-serve AP History practice: a document can carry its own
-- immutable AP snapshot (prompt, sources, rubric) without a teacher assignment.
ALTER TABLE "Document" ADD COLUMN "apHistorySnapshot" JSONB;
