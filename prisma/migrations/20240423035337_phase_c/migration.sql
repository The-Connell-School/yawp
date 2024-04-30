/*
  Warnings:

  - Made the column `documentId` on table `CourseModuleSession` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CourseModuleSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "instructionsCompleted" INTEGER NOT NULL,
    "courseModuleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    CONSTRAINT "CourseModuleSession_courseModuleId_fkey" FOREIGN KEY ("courseModuleId") REFERENCES "CourseModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseModuleSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseModuleSession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CourseModuleSession" ("courseModuleId", "createdAt", "documentId", "id", "instructionsCompleted", "updatedAt", "userId") SELECT "courseModuleId", "createdAt", "documentId", "id", "instructionsCompleted", "updatedAt", "userId" FROM "CourseModuleSession";
DROP TABLE "CourseModuleSession";
ALTER TABLE "new_CourseModuleSession" RENAME TO "CourseModuleSession";
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "text" TEXT,
    "html" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("createdAt", "html", "id", "text", "updatedAt", "userId") SELECT "createdAt", "html", "id", "text", "updatedAt", "userId" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
