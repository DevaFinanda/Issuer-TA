-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREDENTIAL_ISSUED', 'CREDENTIAL_RETRIEVED', 'CREDENTIAL_REVOKED', 'CREDENTIAL_VERIFIED', 'API_KEY_CREATED', 'API_KEY_REVOKED', 'CONFIG_UPDATED', 'SYSTEM_ERROR');

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "sdJwt" TEXT NOT NULL,
    "holderDID" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'BPJS_DOCUMENT',
    "noBPJS" TEXT NOT NULL,
    "nik" TEXT NOT NULL,
    "tanggalLahir" TEXT,
    "alamat" TEXT,
    "metadata" JSONB,
    "issuerDID" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL DEFAULT 'BPJS Kesehatan',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revocation_list" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "revokedBy" TEXT,

    CONSTRAINT "revocation_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuer_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuer_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credentials_holderDID_idx" ON "credentials"("holderDID");

-- CreateIndex
CREATE INDEX "credentials_noBPJS_idx" ON "credentials"("noBPJS");

-- CreateIndex
CREATE INDEX "credentials_nik_idx" ON "credentials"("nik");

-- CreateIndex
CREATE INDEX "credentials_documentId_idx" ON "credentials"("documentId");

-- CreateIndex
CREATE INDEX "credentials_status_idx" ON "credentials"("status");

-- CreateIndex
CREATE INDEX "credentials_issuedAt_idx" ON "credentials"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "revocation_list_credentialId_key" ON "revocation_list"("credentialId");

-- CreateIndex
CREATE INDEX "revocation_list_credentialId_idx" ON "revocation_list"("credentialId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "issuer_config_key_key" ON "issuer_config"("key");
