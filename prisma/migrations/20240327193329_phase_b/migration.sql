/*
  Warnings:

  - You are about to drop the `Exercise` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExerciseComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExerciseSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExerciseSessionMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Instruction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Module_` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `studentProfileId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `teacherProfileId` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ExerciseComment_userId_key";

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN "period" TEXT;

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

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Instruction";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Module_";
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
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "CourseImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "altText" TEXT,
    "contentType" TEXT NOT NULL,
    "blob" BLOB NOT NULL,
    "courseId" TEXT NOT NULL,
    CONSTRAINT "CourseImage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT,
    "tutorId" TEXT,
    "courseId" TEXT,
    CONSTRAINT "CourseModule_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseModuleInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "courseModuleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "answerKey" TEXT,
    "hasAnswerKey" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT NOT NULL,
    "promptType" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "answerTypeOptions" TEXT,
    "concludingPrompt" TEXT,
    "concludingPromptType" TEXT,
    "canAskQuestion" BOOLEAN NOT NULL DEFAULT false,
    "interactiveType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "CourseModuleInstruction_courseModuleId_fkey" FOREIGN KEY ("courseModuleId") REFERENCES "CourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseModuleSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "courseModuleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instructionsCompleted" INTEGER NOT NULL,
    "documentId" TEXT,
    CONSTRAINT "CourseModuleSession_courseModuleId_fkey" FOREIGN KEY ("courseModuleId") REFERENCES "CourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseModuleSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseModuleSession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseModuleSessionMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseModuleSessionId" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "factCheckPrompt" TEXT,
    "context" TEXT,
    CONSTRAINT "CourseModuleSessionMessage_courseModuleSessionId_fkey" FOREIGN KEY ("courseModuleSessionId") REFERENCES "CourseModuleSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "text" TEXT,
    "html" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    CONSTRAINT "DocumentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentCommentResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "DocumentCommentResponse_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "DocumentComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentCommentResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "CourseImage_courseId_key" ON "CourseImage"("courseId");
