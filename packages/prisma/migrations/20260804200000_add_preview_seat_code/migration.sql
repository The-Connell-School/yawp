ALTER TABLE "Organization" ADD COLUMN "previewSeatCode" TEXT;

CREATE UNIQUE INDEX "Organization_previewSeatCode_key" ON "Organization"("previewSeatCode");
