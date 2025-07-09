-- CreateInitialSnapshots Migration
-- This migration creates initial snapshots for existing documents that don't have any snapshots yet
-- This ensures backwards compatibility with existing documents

-- Create a temporary operation for each document without operations
INSERT INTO "DocumentOperation" ("id", "documentId", "userId", "position", "timestamp", "type", "content", "metadata")
SELECT 
  gen_random_uuid() as "id",
  d."id" as "documentId",
  d."userId" as "userId",
  0 as "position",
  d."createdAt" as "timestamp",
  'insert' as "type",
  COALESCE(d."text", '') as "content",
  '{"isInitialSnapshot": true}' as "metadata"
FROM "Document" d
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentOperation" op WHERE op."documentId" = d."id"
);

-- Create initial snapshots for documents that don't have any operations or snapshots
INSERT INTO "DocumentSnapshot" ("id", "documentId", "operationId", "html", "text", "timestamp")
SELECT 
  gen_random_uuid() as "id",
  d."id" as "documentId",
  op."id" as "operationId",
  COALESCE(d."html", '') as "html",
  COALESCE(d."text", '') as "text",
  d."createdAt" as "timestamp"
FROM "Document" d
JOIN "DocumentOperation" op ON op."documentId" = d."id" AND op."position" = 0
WHERE NOT EXISTS (
  SELECT 1 FROM "DocumentSnapshot" s WHERE s."documentId" = d."id"
)
AND EXISTS (
  SELECT 1 FROM "DocumentOperation" op2 WHERE op2."documentId" = d."id" AND op2."metadata"::text LIKE '%isInitialSnapshot%'
);