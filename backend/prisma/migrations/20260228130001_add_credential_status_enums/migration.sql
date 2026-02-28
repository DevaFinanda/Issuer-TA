-- Migration 1 of 2: Add new enum values to CredentialStatus
-- 
-- NOTE: ALTER TYPE ... ADD VALUE is NON-TRANSACTIONAL in PostgreSQL.
-- These values MUST be committed in a separate transaction before they can be
-- used as column defaults or in CHECK constraints.
-- That is why this is split into a separate migration from the table changes.

ALTER TYPE "CredentialStatus" ADD VALUE IF NOT EXISTS 'OFFERED';
ALTER TYPE "CredentialStatus" ADD VALUE IF NOT EXISTS 'CLAIMED';
