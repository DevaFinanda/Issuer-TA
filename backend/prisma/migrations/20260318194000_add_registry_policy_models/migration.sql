-- Add onboarding lifecycle + trusted registry + trust-list + policy decision logs

DO $$ BEGIN
  CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'VERIFIED';

CREATE TABLE IF NOT EXISTS "trusted_registry_identities" (
  "id" TEXT PRIMARY KEY,
  "nik" TEXT NOT NULL UNIQUE,
  "nama" TEXT NOT NULL,
  "tanggalLahir" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'PT21_IMPORT',
  "sourceRef" TEXT,
  "livenessPassed" BOOLEAN,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "trusted_issuers" (
  "id" TEXT PRIMARY KEY,
  "did" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "checkRevocation" BOOLEAN NOT NULL DEFAULT false,
  "minMatchScore" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "requiredClaims" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "pairwise_dids" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "holderDid" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pairwise_dids_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "policy_decisions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "holderDid" TEXT,
  "allowed" BOOLEAN NOT NULL,
  "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "score" DOUBLE PRECISION,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "trusted_registry_identities_nik_idx" ON "trusted_registry_identities"("nik");
CREATE INDEX IF NOT EXISTS "trusted_registry_identities_isActive_idx" ON "trusted_registry_identities"("isActive");

CREATE INDEX IF NOT EXISTS "trusted_issuers_did_idx" ON "trusted_issuers"("did");
CREATE INDEX IF NOT EXISTS "trusted_issuers_isActive_idx" ON "trusted_issuers"("isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "pairwise_dids_userId_context_key" ON "pairwise_dids"("userId", "context");
CREATE UNIQUE INDEX IF NOT EXISTS "pairwise_dids_holderDid_key" ON "pairwise_dids"("holderDid");
CREATE INDEX IF NOT EXISTS "pairwise_dids_userId_idx" ON "pairwise_dids"("userId");

CREATE INDEX IF NOT EXISTS "policy_decisions_userId_idx" ON "policy_decisions"("userId");
CREATE INDEX IF NOT EXISTS "policy_decisions_allowed_idx" ON "policy_decisions"("allowed");
CREATE INDEX IF NOT EXISTS "policy_decisions_createdAt_idx" ON "policy_decisions"("createdAt");
