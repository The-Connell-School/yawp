-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlightId" TEXT,
    "documentId" TEXT NOT NULL,
    CONSTRAINT "DocumentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DocumentComment" ("content", "createdAt", "documentId", "highlightId", "id", "userId") SELECT "content", "createdAt", "documentId", "highlightId", "id", "userId" FROM "DocumentComment";
DROP TABLE "DocumentComment";
ALTER TABLE "new_DocumentComment" RENAME TO "DocumentComment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
