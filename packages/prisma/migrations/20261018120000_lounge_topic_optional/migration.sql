-- Faculty Lounge round 6: a post may have no topic. Additive: existing rows keep theirs.
ALTER TABLE "LoungePost" ALTER COLUMN "topic" DROP NOT NULL;
