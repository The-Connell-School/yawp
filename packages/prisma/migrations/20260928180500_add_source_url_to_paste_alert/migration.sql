-- Add nullable sourceUrl to PasteAlert for real paste provenance
ALTER TABLE "PasteAlert" ADD COLUMN "sourceUrl" TEXT;

