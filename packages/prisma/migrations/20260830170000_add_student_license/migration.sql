CREATE TYPE "StudentLicenseStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'REFUNDED',
  'DISPUTED',
  'REVOKED'
);

CREATE TYPE "StudentLicenseSource" AS ENUM (
  'STRIPE_CHECKOUT',
  'EXISTING_SUBSCRIPTION',
  'MANUAL'
);

CREATE TABLE "StudentLicense" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "membershipId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cohort" TEXT NOT NULL,
  "status" "StudentLicenseStatus" NOT NULL DEFAULT 'PENDING',
  "source" "StudentLicenseSource" NOT NULL DEFAULT 'STRIPE_CHECKOUT',
  "validUntil" TIMESTAMPTZ(6) NOT NULL,
  "checkoutAttempt" INTEGER NOT NULL DEFAULT 0,
  "amountPaid" INTEGER,
  "currency" TEXT,
  "stripePriceId" TEXT,
  "stripeCustomerId" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "paidAt" TIMESTAMPTZ(6),
  "revokedAt" TIMESTAMPTZ(6),

  CONSTRAINT "StudentLicense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentLicense_stripeCheckoutSessionId_key"
  ON "StudentLicense"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "StudentLicense_stripePaymentIntentId_key"
  ON "StudentLicense"("stripePaymentIntentId");
CREATE UNIQUE INDEX "StudentLicense_membershipId_cohort_key"
  ON "StudentLicense"("membershipId", "cohort");
CREATE INDEX "StudentLicense_organizationId_status_validUntil_idx"
  ON "StudentLicense"("organizationId", "status", "validUntil");

ALTER TABLE "StudentLicense"
  ADD CONSTRAINT "StudentLicense_membershipId_organizationId_fkey"
  FOREIGN KEY ("membershipId", "organizationId")
  REFERENCES "OrgMembership"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentLicense"
  ADD CONSTRAINT "StudentLicense_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
