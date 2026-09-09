-- The collaboration room, self-hosted.
--
-- Rather than paying a provider to hold live document state, the state lives here
-- and clients exchange Yjs updates over ordinary HTTP. Yjs updates are commutative
-- and idempotent, which is what makes that safe: late, duplicated or out-of-order
-- delivery cannot corrupt the document, so a polling transport is correct rather
-- than merely tolerable.
--
-- Additive. Nothing reads or writes this table until the collaborative editor is
-- pointed at it.

BEGIN;

-- `seq` is one global autoincrement rather than a per-document counter.
-- Per-document ordering is still correct, because each document's rows are a
-- subset of a single monotonic sequence — and it removes the read-then-write race
-- that allocating MAX(seq)+1 per document would introduce.
CREATE TABLE "DocumentCollabUpdate" (
  "seq"          SERIAL NOT NULL,
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "documentId"   TEXT NOT NULL,
  "update"       BYTEA NOT NULL,
  "membershipId" TEXT,
  -- A compaction row merges every update up to its own seq. Safe for a client
  -- holding an older cursor: it receives the merged row, and applying content it
  -- already has is a no-op in Yjs.
  "isCompaction" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "DocumentCollabUpdate_pkey" PRIMARY KEY ("seq")
);

-- The only query shape: "everything for this document after this cursor".
CREATE INDEX "DocumentCollabUpdate_documentId_seq_idx"
  ON "DocumentCollabUpdate"("documentId", "seq");

-- Cascade: deleting a document discards its room, which no longer means anything.
ALTER TABLE "DocumentCollabUpdate"
  ADD CONSTRAINT "DocumentCollabUpdate_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
