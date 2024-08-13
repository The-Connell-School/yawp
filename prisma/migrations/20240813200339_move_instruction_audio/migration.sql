/*
  Warnings:

  - You are about to drop the column `promptAudio` on the `CourseModuleInstruction` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "InstructionAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "blob" BLOB NOT NULL,
    "courseModuleInstructionId" TEXT NOT NULL,
    CONSTRAINT "InstructionAudio_courseModuleInstructionId_fkey" FOREIGN KEY ("courseModuleInstructionId") REFERENCES "CourseModuleInstruction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Insert existing promptAudio data into InstructionAudio
INSERT INTO "InstructionAudio" ("id", "createdAt", "updatedAt", "blob", "courseModuleInstructionId")
SELECT
    LOWER(HEX(RANDOMBLOB(16))), -- Generate a random UUID
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    "promptAudio",
    "id"
FROM "CourseModuleInstruction"
WHERE "promptAudio" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CourseModuleInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "courseModuleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "interactiveType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "tutorInstructions" TEXT,
    "answerType" TEXT,
    "answerKey" TEXT,
    "answerTypeOptions" TEXT,
    "canAskQuestion" BOOLEAN DEFAULT false,
    "nextInstructionBtnLabel" TEXT,
    CONSTRAINT "CourseModuleInstruction_courseModuleId_fkey" FOREIGN KEY ("courseModuleId") REFERENCES "CourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CourseModuleInstruction" ("answerKey", "answerType", "answerTypeOptions", "canAskQuestion", "courseModuleId", "createdAt", "id", "interactiveType", "nextInstructionBtnLabel", "position", "prompt", "title", "tutorInstructions", "updatedAt") SELECT "answerKey", "answerType", "answerTypeOptions", "canAskQuestion", "courseModuleId", "createdAt", "id", "interactiveType", "nextInstructionBtnLabel", "position", "prompt", "title", "tutorInstructions", "updatedAt" FROM "CourseModuleInstruction";
DROP TABLE "CourseModuleInstruction";
ALTER TABLE "new_CourseModuleInstruction" RENAME TO "CourseModuleInstruction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "InstructionAudio_courseModuleInstructionId_key" ON "InstructionAudio"("courseModuleInstructionId");
