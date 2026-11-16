SET lock_timeout = '5s';

-- The Short Response card, at a new address.
--
-- Card images are served by row id with a one-year immutable browser cache.
-- 20261115120000 swapped this type's picture in place, under the same id, so
-- a browser that had already loaded the old card (the cat above a "Class
-- Starter" wordmark) kept showing it. Giving the row a new id changes the
-- image's URL, and every browser fetches the new card.
--
-- Nothing references this id (the type finds its image by assignmentTypeId),
-- so only the URL changes. The picture itself is not touched here: a card
-- somebody uploaded keeps its bytes. A database without the row is a no-op,
-- and so is a second run.
UPDATE "AssignmentTypeImage" AS img
SET
  "id" = 'cmshortresponsecard20261115a',
  "updatedAt" = NOW()
FROM "AssignmentType" AS t
WHERE img."assignmentTypeId" = t."id"
  AND t."kind" = 'daily_pages'
  AND img."id" <> 'cmshortresponsecard20261115a';
