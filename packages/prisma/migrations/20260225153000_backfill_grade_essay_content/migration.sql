-- Backfill frozen essay content onto existing grades from their linked snapshots
UPDATE "Grade" AS g
SET
  "essayText" = s."text",
  "essayHtml" = s."html"
FROM "DocumentSnapshot" AS s
WHERE
  g."snapshotId" = s."id"
  AND (g."essayText" IS NULL OR g."essayHtml" IS NULL);
