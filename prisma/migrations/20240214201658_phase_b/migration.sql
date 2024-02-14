/*
  Warnings:

  - You are about to drop the `Exercise` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExerciseComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExerciseSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExerciseSessionMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `studentProfileId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `teacherProfileId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `exerciseId` on the `Instruction` table. All the data in the column will be lost.
  - You are about to drop the column `descriptionHtml` on the `Module_` table. All the data in the column will be lost.
  - You are about to drop the column `descriptionText` on the `Module_` table. All the data in the column will be lost.
  - Added the required column `moduleId` to the `Instruction` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ExerciseComment_userId_key";

-- AlterTable
ALTER TABLE "Verification" ADD COLUMN "metadata" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Exercise";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExerciseComment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExerciseSession";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExerciseSessionMessage";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Tutor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT
);

-- CreateTable
CREATE TABLE "ModuleSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instructionsCompleted" INTEGER NOT NULL,
    "currentContentText" TEXT,
    "currentContentHtml" TEXT,
    CONSTRAINT "ModuleSession_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module_" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moduleSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlightId" TEXT,
    CONSTRAINT "ModuleComment_moduleSessionId_fkey" FOREIGN KEY ("moduleSessionId") REFERENCES "ModuleSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleSessionMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moduleSessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "context" TEXT,
    CONSTRAINT "ModuleSessionMessage_moduleSessionId_fkey" FOREIGN KEY ("moduleSessionId") REFERENCES "ModuleSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "blob" BLOB NOT NULL,
    "userId" TEXT NOT NULL,
    "tutorId" TEXT,
    CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Upload_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "updatedAt") SELECT "createdAt", "email", "id", "name", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_Instruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptType" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "answerTypeOptions" TEXT,
    "position" INTEGER NOT NULL,
    CONSTRAINT "Instruction_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module_" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Instruction" ("answerKey", "answerType", "createdAt", "id", "position", "prompt", "promptType", "updatedAt") SELECT "answerKey", "answerType", "createdAt", "id", "position", "prompt", "promptType", "updatedAt" FROM "Instruction";
DROP TABLE "Instruction";
ALTER TABLE "new_Instruction" RENAME TO "Instruction";
CREATE TABLE "new_Module_" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT,
    "copyContentFromPrevious" BOOLEAN NOT NULL DEFAULT false,
    "tutorId" TEXT,
    CONSTRAINT "Module__tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Module_" ("copyContentFromPrevious", "createdAt", "id", "position", "title", "updatedAt") SELECT "copyContentFromPrevious", "createdAt", "id", "position", "title", "updatedAt" FROM "Module_";
DROP TABLE "Module_";
ALTER TABLE "new_Module_" RENAME TO "Module_";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "ModuleComment_userId_key" ON "ModuleComment"("userId");
