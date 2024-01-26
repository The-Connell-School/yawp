-- AlterTable
ALTER TABLE "User" ADD COLUMN "studentProfileId" TEXT;
ALTER TABLE "User" ADD COLUMN "teacherProfileId" TEXT;

-- CreateTable
CREATE TABLE "AssistantConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assistantId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "actionText" TEXT,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "AssistantMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assistantId" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AssistantMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assistantMetadataId" TEXT NOT NULL,
    CONSTRAINT "Thread_assistantMetadataId_fkey" FOREIGN KEY ("assistantMetadataId") REFERENCES "AssistantMetadata" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workshopLeaderId" TEXT,
    "school" TEXT,
    "schoolTeacher" TEXT,
    "grade" TEXT,
    CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentProfile_workshopLeaderId_fkey" FOREIGN KEY ("workshopLeaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Module_" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "descriptionText" TEXT,
    "descriptionHtml" TEXT,
    "position" INTEGER NOT NULL,
    "copyContentFromPrevious" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT,
    "copyContentFromPrevious" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Exercise_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module_" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Instruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "answerKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptType" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "Instruction_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "instructionPosition" INTEGER NOT NULL,
    "contentText" TEXT,
    "contentHtml" TEXT,
    CONSTRAINT "ExerciseSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exerciseSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "ExerciseComment_exerciseSessionId_fkey" FOREIGN KEY ("exerciseSessionId") REFERENCES "ExerciseSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseSessionMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exerciseSessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "context" TEXT,
    CONSTRAINT "ExerciseSessionMessage_exerciseSessionId_fkey" FOREIGN KEY ("exerciseSessionId") REFERENCES "ExerciseSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantConfiguration_assistantId_key" ON "AssistantConfiguration"("assistantId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMetadata_assistantId_key" ON "AssistantMetadata"("assistantId");

-- CreateIndex
CREATE UNIQUE INDEX "Thread_threadId_key" ON "Thread"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseComment_userId_key" ON "ExerciseComment"("userId");
