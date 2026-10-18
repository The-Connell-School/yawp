-- Faculty Lounge round 6: screenshots and photos on posts (lounge_post_images flag).
CREATE TABLE "LoungePostImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "altText" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "blob" BYTEA NOT NULL,

    CONSTRAINT "LoungePostImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoungePostImage_postId_position_idx" ON "LoungePostImage"("postId", "position");

ALTER TABLE "LoungePostImage" ADD CONSTRAINT "LoungePostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "LoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
