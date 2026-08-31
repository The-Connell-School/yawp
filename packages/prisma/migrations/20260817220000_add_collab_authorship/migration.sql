-- Preserve who wrote what in a collaborative draft across compaction.
--
-- Every item in a Yjs document permanently carries the id of the client that
-- created it, so authorship of surviving text is a property of the document.
-- What the document cannot say is which *person* a client id belongs to — only
-- the DocumentCollabUpdate row that carried it knows that, and compactRoom
-- deletes those rows once a log passes 200 updates. Without this table a
-- compacted room still knows that some client wrote the conclusion and has no
-- way left to say who.
--
-- One row is approximately one editing session, because Yjs mints a fresh client
-- id per document instance. That is also where the session timeline comes from,
-- since compaction discards the per-update timestamps too.
--
-- Additive. No existing table is touched and nothing reads this yet.
--
-- Note: `clientId` is TEXT rather than INTEGER on purpose. Yjs generates uint32
-- client ids, which run to 4294967295 and would overflow a Postgres integer.

BEGIN;

CREATE TABLE "DocumentCollabAuthor" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "membershipId" TEXT,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateCount" INTEGER NOT NULL DEFAULT 0,
    "charsInserted" INTEGER NOT NULL DEFAULT 0,
    "charsDeleted" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCollabAuthor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentCollabAuthor_documentId_membershipId_idx" ON "DocumentCollabAuthor"("documentId", "membershipId");

CREATE UNIQUE INDEX "DocumentCollabAuthor_documentId_clientId_key" ON "DocumentCollabAuthor"("documentId", "clientId");

ALTER TABLE "DocumentCollabAuthor" ADD CONSTRAINT "DocumentCollabAuthor_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentCollabAuthor" ADD CONSTRAINT "DocumentCollabAuthor_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
