/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Class` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "code" TEXT,
ADD COLUMN     "gradeLevels" TEXT[],
ADD COLUMN     "name" TEXT,
ALTER COLUMN "period" DROP NOT NULL,
ALTER COLUMN "grade" DROP NOT NULL;

-- Generate random codes for existing classes
UPDATE "Class"
SET "code" = CONCAT(
  SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' FROM (random() * 36 + 1)::integer FOR 1),
  SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' FROM (random() * 36 + 1)::integer FOR 1),
  SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' FROM (random() * 36 + 1)::integer FOR 1),
  SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' FROM (random() * 36 + 1)::integer FOR 1),
  SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' FROM (random() * 36 + 1)::integer FOR 1),
  SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' FROM (random() * 36 + 1)::integer FOR 1)
)
WHERE "code" IS NULL;


-- CreateIndex
CREATE UNIQUE INDEX "Class_code_key" ON "Class"("code");
