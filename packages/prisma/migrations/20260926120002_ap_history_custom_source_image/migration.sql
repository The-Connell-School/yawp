-- Storage for teacher-uploaded DBQ source images on custom AP History
-- assignments. Bytes are served from our own origin, like every other image.
CREATE TABLE "ApHistoryCustomSourceImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "blob" BYTEA NOT NULL,
    "altText" TEXT,
    "createdById" TEXT,
    CONSTRAINT "ApHistoryCustomSourceImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApHistoryCustomSourceImage_key_key" ON "ApHistoryCustomSourceImage"("key");
CREATE INDEX "ApHistoryCustomSourceImage_createdById_idx" ON "ApHistoryCustomSourceImage"("createdById");
