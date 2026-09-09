-- Collaborator carets: where each writer is in a shared draft, right now.
--
-- The only ephemeral table in this subsystem. A row is one open editor; it is
-- rewritten every few seconds while that editor is open, deleted when it closes,
-- and skipped once it goes stale. Nothing here is worth keeping, and nothing
-- reads it except the poll that draws the carets.
--
-- In Postgres rather than in a process because the transport is HTTP polling
-- against however many app instances are running. Presence held in memory would
-- be presence held per instance, so two students in one group would see each
-- other only when their requests happened to land on the same one — teammates
-- whose carets come and go, which is worse than no carets at all.
--
-- Additive. Nothing reads or writes this table until the editor asks for it.

BEGIN;

CREATE TABLE "DocumentCollabPresence" (
  -- Yjs client id. Text, not integer, for the same reason
  -- DocumentCollabAuthor.clientId is: Yjs mints uint32 values that run past the
  -- 2147483647 ceiling of a Postgres integer column.
  "clientId"     TEXT NOT NULL,
  "documentId"   TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  -- One encoded Yjs awareness update carrying exactly this client's state. The
  -- name and colour inside it are written by the server, never by the browser.
  "state"        BYTEA NOT NULL,
  -- Doubles as the liveness clock: a row older than the presence TTL is a closed
  -- tab that never got to say goodbye.
  "updatedAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- membershipId is part of the key rather than merely a column: one student
  -- guessing another's client id then writes their own row, not over theirs.
  CONSTRAINT "DocumentCollabPresence_pkey"
    PRIMARY KEY ("documentId", "membershipId", "clientId")
);

-- The only query shape: "everyone still live in this document", which is a range
-- scan on updatedAt within one document. The same index serves the sweep.
CREATE INDEX "DocumentCollabPresence_documentId_updatedAt_idx"
  ON "DocumentCollabPresence"("documentId", "updatedAt");

-- Cascade on both sides: a deleted document has no room to be present in, and a
-- removed membership has no caret to draw.
ALTER TABLE "DocumentCollabPresence"
  ADD CONSTRAINT "DocumentCollabPresence_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentCollabPresence"
  ADD CONSTRAINT "DocumentCollabPresence_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
