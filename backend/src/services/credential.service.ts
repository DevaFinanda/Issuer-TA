import { prisma, CredentialStatus, AuditAction } from '../lib/prisma.js'
import type { Prisma } from '../lib/prisma.js'
import * as crypto from 'crypto'

// ============================================
// CREDENTIAL SERVICE
// ============================================

export interface CreateCredentialInput {
  sdJwt?: string                    // Optional: filled when holder claims
  credentialOfferUri?: string       // OpenID4VCI credential offer URI
  issuanceSessionId?: string        // Credo issuance session ID
  holderDID: string
  holderName: string
  documentId: string
  documentHash: string
  documentType?: string
  noBPJS: string
  nik: string
  tanggalLahir?: string
  alamat?: string
  metadata?: Record<string, any>
  issuerDID: string
  issuerName?: string
  validUntil: Date
}

export interface CredentialWithId {
  id: string
  sdJwt: string
  credentialData: any
  issuedAt: string
  expiresAt: string
}

/**
 * Store credential ke database
 * In the new OID4VCI flow, sdJwt is initially null (credential not yet claimed)
 * It gets updated when the holder claims the credential via the OID4VCI protocol
 */
export async function storeCredentialDB(input: CreateCredentialInput): Promise<string> {
  const credential = await prisma.credential.create({
    data: {
      sdJwt: input.sdJwt || null,
      credentialOfferUri: input.credentialOfferUri || null,
      issuanceSessionId: input.issuanceSessionId || null,
      holderDID: input.holderDID,
      holderName: input.holderName,
      documentId: input.documentId,
      documentHash: input.documentHash,
      documentType: input.documentType || 'BPJS_DOCUMENT',
      noBPJS: input.noBPJS,
      nik: input.nik,
      tanggalLahir: input.tanggalLahir,
      alamat: input.alamat,
      metadata: input.metadata as Prisma.InputJsonValue,
      issuerDID: input.issuerDID,
      issuerName: input.issuerName || 'BPJS Kesehatan',
      validUntil: input.validUntil,
      // Status starts as OFFERED in OID4VCI flow
      status: input.credentialOfferUri ? CredentialStatus.OFFERED : CredentialStatus.ACTIVE,
    },
  })

  // Log audit
  await createAuditLog({
    action: AuditAction.CREDENTIAL_ISSUED,
    entityType: 'Credential',
    entityId: credential.id,
    actorType: 'system',
    details: {
      holderDID: input.holderDID,
      documentId: input.documentId,
    },
  })

  console.log('💾 Credential stored in database with ID:', credential.id)
  return credential.id
}

/**
 * Get credential by ID
 */
export async function getCredentialDB(id: string): Promise<CredentialWithId | null> {
  const credential = await prisma.credential.findUnique({
    where: { id },
  })

  if (!credential) {
    return null
  }

  // Check if expired
  if (credential.validUntil < new Date()) {
    // Update status to expired
    await prisma.credential.update({
      where: { id },
      data: { status: CredentialStatus.EXPIRED },
    })
  }

  // Check if revoked
  if (credential.status === CredentialStatus.REVOKED) {
    return null
  }

  // Log access
  await createAuditLog({
    action: AuditAction.CREDENTIAL_RETRIEVED,
    entityType: 'Credential',
    entityId: id,
    actorType: 'api',
  })

  return {
    id: credential.id,
    sdJwt: credential.sdJwt,
    credentialData: {
      holderName: credential.holderName,
      holderDID: credential.holderDID,
      documentId: credential.documentId,
      documentType: credential.documentType,
      noBPJS: credential.noBPJS,
      metadata: credential.metadata,
    },
    issuedAt: credential.issuedAt.toISOString(),
    expiresAt: credential.validUntil.toISOString(),
  }
}

/**
 * Get credential by holder DID
 */
export async function getCredentialsByHolderDID(holderDID: string) {
  return prisma.credential.findMany({
    where: {
      holderDID,
      status: CredentialStatus.ACTIVE,
    },
    orderBy: { issuedAt: 'desc' },
  })
}

/**
 * Get credential by BPJS number
 */
export async function getCredentialByNoBPJS(noBPJS: string) {
  return prisma.credential.findFirst({
    where: {
      noBPJS,
      status: CredentialStatus.ACTIVE,
    },
    orderBy: { issuedAt: 'desc' },
  })
}

/**
 * Revoke credential
 */
export async function revokeCredential(
  id: string,
  reason?: string,
  revokedBy?: string
): Promise<boolean> {
  const credential = await prisma.credential.findUnique({
    where: { id },
  })

  if (!credential) {
    return false
  }

  // Update credential status
  await prisma.credential.update({
    where: { id },
    data: {
      status: CredentialStatus.REVOKED,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })

  // Add to revocation list
  await prisma.revocationList.create({
    data: {
      credentialId: id,
      reason,
      revokedBy,
    },
  })

  // Audit log
  await createAuditLog({
    action: AuditAction.CREDENTIAL_REVOKED,
    entityType: 'Credential',
    entityId: id,
    actorType: 'admin',
    actorId: revokedBy,
    details: { reason },
  })

  console.log('🚫 Credential revoked:', id)
  return true
}

/**
 * Check if credential is revoked
 */
export async function isCredentialRevoked(id: string): Promise<boolean> {
  const revoked = await prisma.revocationList.findUnique({
    where: { credentialId: id },
  })
  return !!revoked
}

/**
 * Get all credentials with pagination
 */
export async function getAllCredentials(
  page: number = 1,
  limit: number = 10,
  status?: CredentialStatus
) {
  const skip = (page - 1) * limit

  const where: Prisma.CredentialWhereInput = status ? { status } : {}

  const [credentials, total] = await Promise.all([
    prisma.credential.findMany({
      where,
      skip,
      take: limit,
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        holderName: true,
        holderDID: true,
        documentId: true,
        documentType: true,
        noBPJS: true,
        status: true,
        issuedAt: true,
        validUntil: true,
      },
    }),
    prisma.credential.count({ where }),
  ])

  return {
    credentials,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Get all credentials from database (for API endpoint)
 * Returns all active and offered credentials to verify persistence
 */
export async function getAllCredentialsFromDB() {
  return prisma.credential.findMany({
    where: {
      status: {
        in: [CredentialStatus.ACTIVE, CredentialStatus.OFFERED, CredentialStatus.CLAIMED],
      },
    },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      holderName: true,
      holderDID: true,
      documentId: true,
      documentType: true,
      noBPJS: true,
      nik: true,
      status: true,
      issuedAt: true,
      validUntil: true,
      metadata: true,
      credentialOfferUri: true,
      issuanceSessionId: true,
    },
  })
}

/**
 * Search credentials
 */
export async function searchCredentials(query: string) {
  return prisma.credential.findMany({
    where: {
      OR: [
        { holderName: { contains: query, mode: 'insensitive' } },
        { noBPJS: { contains: query } },
        { nik: { contains: query } },
        { documentId: { contains: query } },
      ],
    },
    orderBy: { issuedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      holderName: true,
      holderDID: true,
      documentId: true,
      noBPJS: true,
      status: true,
      issuedAt: true,
    },
  })
}

// ============================================
// AUDIT LOG SERVICE
// ============================================

interface CreateAuditLogInput {
  action: AuditAction
  entityType: string
  entityId?: string
  actorType: string
  actorId?: string
  details?: Record<string, any>
  ipAddress?: string
  userAgent?: string
}

export async function createAuditLog(input: CreateAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorType: input.actorType,
      actorId: input.actorId,
      details: input.details as Prisma.InputJsonValue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  })
}

export async function getAuditLogs(
  page: number = 1,
  limit: number = 50,
  action?: AuditAction
) {
  const skip = (page - 1) * limit
  const where: Prisma.AuditLogWhereInput = action ? { action } : {}

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

// ============================================
// API KEY SERVICE
// ============================================

/**
 * Create API Key
 */
export async function createApiKey(
  name: string,
  permissions: string[] = ['read'],
  expiresAt?: Date
): Promise<{ apiKey: string; id: string }> {
  // Generate random API key
  const rawKey = crypto.randomBytes(32).toString('hex')
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

  const apiKeyRecord = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      permissions,
      expiresAt,
    },
  })

  await createAuditLog({
    action: AuditAction.API_KEY_CREATED,
    entityType: 'ApiKey',
    entityId: apiKeyRecord.id,
    actorType: 'admin',
    details: { name, permissions },
  })

  // Return raw key (hanya sekali, tidak disimpan)
  return {
    apiKey: rawKey,
    id: apiKeyRecord.id,
  }
}

/**
 * Validate API Key
 */
export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean
  permissions?: string[]
  id?: string
}> {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
  })

  if (!apiKeyRecord) {
    return { valid: false }
  }

  // Check if active
  if (!apiKeyRecord.isActive) {
    return { valid: false }
  }

  // Check if expired
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return { valid: false }
  }

  // Update usage
  await prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: {
      lastUsedAt: new Date(),
      usageCount: { increment: 1 },
    },
  })

  return {
    valid: true,
    permissions: apiKeyRecord.permissions,
    id: apiKeyRecord.id,
  }
}

/**
 * Revoke API Key
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const apiKey = await prisma.apiKey.update({
    where: { id },
    data: { isActive: false },
  })

  await createAuditLog({
    action: AuditAction.API_KEY_REVOKED,
    entityType: 'ApiKey',
    entityId: id,
    actorType: 'admin',
  })

  return !!apiKey
}

// ============================================
// STATISTICS
// ============================================

export async function getStatistics() {
  const [
    totalCredentials,
    activeCredentials,
    revokedCredentials,
    expiredCredentials,
    todayIssued,
  ] = await Promise.all([
    prisma.credential.count(),
    prisma.credential.count({ where: { status: CredentialStatus.ACTIVE } }),
    prisma.credential.count({ where: { status: CredentialStatus.REVOKED } }),
    prisma.credential.count({ where: { status: CredentialStatus.EXPIRED } }),
    prisma.credential.count({
      where: {
        issuedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ])

  return {
    totalCredentials,
    activeCredentials,
    revokedCredentials,
    expiredCredentials,
    todayIssued,
  }
}

// ============================================
// CLEANUP EXPIRED CREDENTIALS
// ============================================

export async function cleanupExpiredCredentials(): Promise<number> {
  const result = await prisma.credential.updateMany({
    where: {
      validUntil: { lt: new Date() },
      status: CredentialStatus.ACTIVE,
    },
    data: { status: CredentialStatus.EXPIRED },
  })

  if (result.count > 0) {
    console.log(`🧹 Marked ${result.count} credentials as expired`)
  }

  return result.count
}
