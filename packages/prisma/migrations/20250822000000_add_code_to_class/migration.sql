-- AlterTable
ALTER TABLE "Class" ADD COLUMN "code" TEXT;

-- Populate code column for existing classes with unique random codes
-- Using PostgreSQL's md5 hash function and substring to create short codes
UPDATE "Class"
SET "code" = UPPER(SUBSTRING(md5(id::text || RANDOM()::text), 1, 6));

-- Make code NOT NULL after populating
ALTER TABLE "Class" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Class_code_key" ON "Class"("code");

