-- Add RateLimitBucket and RateLimitDecision tables (additive)
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "key" text PRIMARY KEY,
  "tokens" integer NOT NULL DEFAULT 0,
  "capacity" integer NOT NULL,
  "refillPerMs" double precision NOT NULL DEFAULT 0,
  "lastRefillAt" timestamptz(6) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "RateLimitDecision" (
  "id" text PRIMARY KEY,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  "route" text NOT NULL,
  "feature" text,
  "scope" text NOT NULL,
  "decision" text NOT NULL,
  "subjectKey" text NOT NULL,
  "retryAfterSeconds" integer,
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "RateLimitDecision_route_createdAt_idx" ON "RateLimitDecision" ("route", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "RateLimitDecision_scope_createdAt_idx" ON "RateLimitDecision" ("scope", "createdAt" DESC);

