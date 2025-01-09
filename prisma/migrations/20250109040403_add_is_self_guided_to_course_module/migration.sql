-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CourseModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT,
    "tutorInstructions" TEXT,
    "isSelfGuided" BOOLEAN NOT NULL DEFAULT false,
    "courseId" TEXT,
    CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CourseModule" ("courseId", "createdAt", "deletedAt", "description", "id", "position", "title", "tutorInstructions", "updatedAt") SELECT "courseId", "createdAt", "deletedAt", "description", "id", "position", "title", "tutorInstructions", "updatedAt" FROM "CourseModule";
DROP TABLE "CourseModule";
ALTER TABLE "new_CourseModule" RENAME TO "CourseModule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
