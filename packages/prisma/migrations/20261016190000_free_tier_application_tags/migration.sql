-- Additive only; existing applications remain untagged. No historical inference.
ALTER TABLE "FreeTierApplication" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
