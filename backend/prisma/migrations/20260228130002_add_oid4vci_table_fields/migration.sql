-- Migration 2 of 2: Add OID4VCI fields to credentials table
-- 
-- This runs AFTER migration 20260228130001_add_credential_status_enums
-- which committed the new enum values 'OFFERED' and 'CLAIMED'.
-- 
-- Changes:
--   - sdJwt is now nullable (NULL during offer stage, filled when holder claims)
--   - credentialOfferUri: Stores the openid-credential-offer:// URI for QR code
--   - issuanceSessionId: Links to the in-memory OID4VCI session
--   - claimedAt: Timestamp when holder successfully received the credential
--   - Default status changed from 'ACTIVE' to 'OFFERED'

-- AlterTable: Add new OID4VCI columns, make sdJwt optional, change default status
-- Menggunakan IF NOT EXISTS agar idempotent (aman dijalankan ulang)
ALTER TABLE "credentials"
  ADD COLUMN IF NOT EXISTS "claimedAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "credentialOfferUri"  TEXT,
  ADD COLUMN IF NOT EXISTS "issuanceSessionId"   TEXT;

ALTER TABLE "credentials"
  ALTER COLUMN "sdJwt"   DROP NOT NULL,
  ALTER COLUMN "status"  SET DEFAULT 'OFFERED';

-- CreateIndex: Index for fast session lookups (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'credentials'
    AND indexname = 'credentials_issuanceSessionId_idx'
  ) THEN
    CREATE INDEX "credentials_issuanceSessionId_idx" ON "credentials"("issuanceSessionId");
  END IF;
END $$;
