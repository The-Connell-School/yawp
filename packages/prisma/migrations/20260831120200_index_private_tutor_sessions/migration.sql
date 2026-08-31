-- Phase 3: build the uniqueness guard without blocking writes. This file must
-- remain outside an explicit transaction for CREATE INDEX CONCURRENTLY.
SET lock_timeout = '5s';
SET statement_timeout = '15min';

CREATE UNIQUE INDEX CONCURRENTLY
  "AssignmentModuleSession_documentId_membershipId_assignmentModuleId_key"
  ON "AssignmentModuleSession"("documentId", "membershipId", "assignmentModuleId");
