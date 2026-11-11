SET lock_timeout = '5s';

-- The model-written summary of a class's exit tickets (exit ticket v3 plan,
-- phase 5): what landed, the shared confusion, and whether to reteach. A new
-- table, so nothing existing reads or writes it; behind the
-- exit-ticket-class-summary flag. No student names are stored.
CREATE TABLE "ExitTicketClassSummary" (
  "id"                      TEXT NOT NULL,
  "createdAt"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "classAssignmentId"       TEXT NOT NULL,
  "model"                   TEXT,
  "responseCount"           INTEGER NOT NULL DEFAULT 0,
  "inputFingerprint"        TEXT NOT NULL,
  "summaryJson"             JSONB NOT NULL,
  "generatedByMembershipId" TEXT,
  "generatedAt"             TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExitTicketClassSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExitTicketClassSummary_classAssignmentId_key"
  ON "ExitTicketClassSummary" ("classAssignmentId");

ALTER TABLE "ExitTicketClassSummary"
  ADD CONSTRAINT "ExitTicketClassSummary_classAssignmentId_fkey"
  FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
