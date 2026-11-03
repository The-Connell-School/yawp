-- Add optional screenshot payload for dev-panel feedback (JPEG/WebP data URLs only at app layer).
ALTER TABLE "TesterFeedback" ADD COLUMN "screenshot" TEXT;
