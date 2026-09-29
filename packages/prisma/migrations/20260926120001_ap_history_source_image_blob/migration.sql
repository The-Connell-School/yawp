-- Self-host AP History DBQ source images: store bytes alongside the curated
-- library source so they can be served from our own origin instead of being
-- hotlinked from external hosts (which are unreliable / blocked in previews).
ALTER TABLE "ApHistoryPromptLibrarySource" ADD COLUMN "imageBlob" BYTEA;
ALTER TABLE "ApHistoryPromptLibrarySource" ADD COLUMN "imageContentType" TEXT;
