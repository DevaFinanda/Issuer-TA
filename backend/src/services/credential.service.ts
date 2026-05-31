import { prisma, CredentialStatus, AuditAction } from '../lib/prisma.js'
import type { Prisma } from '../lib/prisma.js'
import * as crypto from 'crypto'

// ============================================
// CREDENTIAL SERVICE — OID4VCI IdentityCredential
// ============================================

export interface CreateCredentialInput {
  id?: string
  credentialJwt?: string            // Signed JWT VC (filled after issuance)
  credentialOfferUri?: string       // OpenID4VCI credential offer URI
  format?: string                   // jwt_vc_json
  holderDID?: string
  holderName: string
  nik: string
  nama: string
  tanggalLahir?: string
  metadata?: Record<string, any>
  issuerDID: string
  issuerName?: string
  validUntil: Date
  userId?: string
}

export interface CredentialWithId {
  id: string
  credentialJwt: string | null
  credentialData: any
  issuedAt: string
  expiresAt: string
}

export interface WalletCredentialRecord {
  id: string
  format: string
  credential: string
  holderDID: string | null
  issuedAt: string
  validUntil: string
  status: CredentialStatus
}

/**
 * Store credential in database
 */
export async function storeCredentialDB(input: CreateCredentialInput): Promise<string> {
  const credential = await prisma.credential.create({
    data: {
      id: input.id,
      credentialJwt: input.credentialJwt || null,
      credentialOfferUri: input.credentialOfferUri || null,
      format: input.format || 'jwt_vc_json',
      holderDID: input.holderDID || null,
      holderName: input.holderName,
      nik: input.nik,
      nama: input.nama,
      tanggalLahir: input.tanggalLahir,
      metadata: input.metadata as Prisma.InputJsonValue,
      issuerDID: input.issuerDID,
      issuerName: input.issuerName || 'Identity Credential Issuer',
      validUntil: input.validUntil,
      userId: input.userId || null,
      status: input.credentialJwt ? CredentialStatus.ACTIVE : CredentialStatus.OFFERED,
    },
  })

  // Audit log
  await createAuditLog({
    action: AuditAction.CREDENTIAL_ISSUED,
    entityType: 'Credential',
    entityId: credential.id,
    actorType: 'system',
    details: {
      nik: input.nik,
      holderName: input.holderName,
      format: input.format || 'jwt_vc_json',
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

  if (!credential) return null

  // Check if expired
  if (credential.validUntil < new Date() && credential.status === CredentialStatus.ACTIVE) {
    await prisma.credential.update({
      where: { id },
      data: { status: CredentialStatus.EXPIRED },
    })
  }

  if (credential.status === CredentialStatus.REVOKED) return null

  // Audit log
  await createAuditLog({
    action: AuditAction.CREDENTIAL_RETRIEVED,
    entityType: 'Credential',
    entityId: id,
    actorType: 'api',
  })

  return {
    id: credential.id,
    credentialJwt: credential.credentialJwt,
    credentialData: {
      holderName: credential.holderName,
      holderDID: credential.holderDID,
      nik: credential.nik,
      nama: credential.nama,
      tanggalLahir: credential.tanggalLahir,
      format: credential.format,
      metadata: credential.metadata,
    },
    issuedAt: credential.issuedAt.toISOString(),
    expiresAt: credential.validUntil.toISOString(),
  }
}

/**
 * Get all credentials from database
 */
export async function getAllCredentialsFromDB() {
  return prisma.credential.findMany({
    where: {
      status: {
        in: [CredentialStatus.ACTIVE, CredentialStatus.OFFERED],
      },
    },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      holderName: true,
      holderDID: true,
      nik: true,
      nama: true,
      tanggalLahir: true,
      format: true,
      status: true,
      issuedAt: true,
      validUntil: true,
      metadata: true,
      credentialOfferUri: true,
    },
  })
}

/**
 * List active credentials for an authenticated holder account.
 */
export async function getActiveWalletCredentialsByUser(
  userId: string,
  holderDid?: string,
  limit: number = 20
): Promise<WalletCredentialRecord[]> {
  const where: Prisma.CredentialWhereInput = {
    userId,
    status: CredentialStatus.ACTIVE,
    credentialJwt: { not: null },
    validUntil: { gt: new Date() },
  }

  if (holderDid) {
    where.OR = [{ holderDID: holderDid }, { holderDID: null }]
  }

  const credentials = await prisma.credential.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      format: true,
      credentialJwt: true,
      holderDID: true,
      issuedAt: true,
      validUntil: true,
      status: true,
    },
  })

  return credentials
    .filter((item) => !!item.credentialJwt)
    .map((item) => ({
      id: item.id,
      format: item.format,
      credential: item.credentialJwt as string,
      holderDID: item.holderDID,
      issuedAt: item.issuedAt.toISOString(),
      validUntil: item.validUntil.toISOString(),
      status: item.status,
    }))
}

/**
 * Reuse latest active credential for the same account when still valid.
 */
export async function findReusableActiveCredentialForUser(
  userId: string,
  holderDid?: string
): Promise<WalletCredentialRecord | null> {
  const [latest] = await getActiveWalletCredentialsByUser(userId, holderDid, 1)
  return latest || null
}

/**
 * Revoke credential
 */
export async function revokeCredential(
  id: string,
  reason?: string,
  revokedBy?: string
): Promise<boolean> {
  const credential = await prisma.credential.findUnique({ where: { id } })
  if (!credential) return false

  await prisma.credential.update({
    where: { id },
    data: {
      status: CredentialStatus.REVOKED,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })

  await prisma.revocationList.create({
    data: { credentialId: id, reason, revokedBy },
  })

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
 * Get credential status summary for wallet sync.
 */
export async function getCredentialStatusSummary(id: string) {
  const credential = await prisma.credential.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      issuedAt: true,
      validUntil: true,
      revokedAt: true,
      revokedReason: true,
      holderDID: true,
    },
  })

  if (!credential) return null

  let effectiveStatus = credential.status

  if (credential.validUntil < new Date() && credential.status === CredentialStatus.ACTIVE) {
    await prisma.credential.update({
      where: { id },
      data: { status: CredentialStatus.EXPIRED },
    })
    effectiveStatus = CredentialStatus.EXPIRED
  }

  return {
    credentialId: credential.id,
    status: effectiveStatus,
    revoked: effectiveStatus === CredentialStatus.REVOKED,
    suspended: effectiveStatus === CredentialStatus.SUSPENDED,
    expired: effectiveStatus === CredentialStatus.EXPIRED,
    validUntil: credential.validUntil.toISOString(),
    revokedAt: credential.revokedAt?.toISOString() || null,
    revokedReason: credential.revokedReason || null,
    holderDID: credential.holderDID,
    updatedAt: credential.revokedAt?.toISOString() || credential.issuedAt.toISOString(),
  }
}

/**
 * Suspend credential
 */
export async function suspendCredential(
  id: string,
  reason?: string,
  suspendedBy?: string
): Promise<boolean> {
  const credential = await prisma.credential.findUnique({ where: { id } })
  if (!credential) return false
  if (credential.status === CredentialStatus.REVOKED) return false

  await prisma.credential.update({
    where: { id },
    data: {
      status: CredentialStatus.SUSPENDED,
      revokedReason: reason || 'Temporarily suspended',
    },
  })

  await createAuditLog({
    action: AuditAction.CONFIG_UPDATED,
    entityType: 'Credential',
    entityId: id,
    actorType: 'admin',
    actorId: suspendedBy,
    details: { status: 'SUSPENDED', reason },
  })

  return true
}

/**
 * Extend credential expiry date
 */
export async function extendCredentialExpiry(
  id: string,
  validUntil: Date,
  updatedBy?: string
): Promise<boolean> {
  const credential = await prisma.credential.findUnique({ where: { id } })
  if (!credential) return false
  if (credential.status === CredentialStatus.REVOKED) return false

  await prisma.credential.update({
    where: { id },
    data: {
      validUntil,
      status: CredentialStatus.ACTIVE,
    },
  })

  await createAuditLog({
    action: AuditAction.CONFIG_UPDATED,
    entityType: 'Credential',
    entityId: id,
    actorType: 'admin',
    actorId: updatedBy,
    details: { validUntil: validUntil.toISOString() },
  })

  return true
}

/**
 * Permanently delete credential (admin)
 */
export async function deleteCredentialById(
  id: string,
  deletedBy?: string
): Promise<boolean> {
  const credential = await prisma.credential.findUnique({ where: { id } })
  if (!credential) return false

  await prisma.$transaction(async (tx) => {
    await tx.revocationList.deleteMany({ where: { credentialId: id } })
    await tx.credential.delete({ where: { id } })
  })

  await createAuditLog({
    action: AuditAction.CONFIG_UPDATED,
    entityType: 'Credential',
    entityId: id,
    actorType: 'admin',
    actorId: deletedBy,
    details: { operation: 'DELETE' },
  })

  return true
}

/**
 * Permanently delete holder account and related data (admin)
 */
export async function deleteHolderById(
  userId: string,
  deletedBy?: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      userType: true,
      nik: true,
      email: true,
      nama: true,
      fullName: true,
    },
  })

  if (!user) return false

  const isHolder = user.userType === 'HOLDER' || Boolean(user.nik)
  if (!isHolder) return false

  const credentialIds = await prisma.credential.findMany({
    where: { userId },
    select: { id: true },
  })
  const ids = credentialIds.map((item) => item.id)

  await prisma.$transaction(async (tx) => {
    if (ids.length > 0) {
      await tx.revocationList.deleteMany({
        where: {
          credentialId: { in: ids },
        },
      })
    }

    await tx.credential.deleteMany({ where: { userId } })
    await tx.authorizationCode.deleteMany({ where: { userId } })
    await tx.accessToken.deleteMany({ where: { userId } })
    await tx.pairwiseDid.deleteMany({ where: { userId } })
    await tx.policyDecision.deleteMany({ where: { userId } })
    await tx.auditLog.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })
  })

  await createAuditLog({
    action: AuditAction.USER_DELETED,
    entityType: 'User',
    entityId: userId,
    actorType: 'admin',
    actorId: deletedBy,
    details: {
      nik: user.nik,
      email: user.email,
      name: user.nama || user.fullName,
      operation: 'DELETE',
    },
  })

  return true
}

/**
 * Get credential detail (admin view)
 */
export async function getCredentialDetailForAdmin(id: string) {
  const credential = await prisma.credential.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          nik: true,
          email: true,
          nama: true,
          fullName: true,
        },
      },
    },
  })

  if (!credential) return null

  return {
    id: credential.id,
    holderDID: credential.holderDID,
    holderName: credential.holderName,
    nik: credential.nik,
    nama: credential.nama,
    tanggalLahir: credential.tanggalLahir,
    format: credential.format,
    status: credential.status,
    issuerDID: credential.issuerDID,
    issuerName: credential.issuerName,
    issuedAt: credential.issuedAt,
    validFrom: credential.validFrom,
    validUntil: credential.validUntil,
    revokedAt: credential.revokedAt,
    revokedReason: credential.revokedReason,
    credentialOfferUri: credential.credentialOfferUri,
    metadata: credential.metadata,
    user: credential.user,
  }
}

/**
 * Get holder management list
 */
export async function getHoldersSummary() {
  const holders = await prisma.user.findMany({
    where: {
      OR: [{ userType: 'HOLDER' }, { nik: { not: null } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nik: true,
      email: true,
      nama: true,
      fullName: true,
      isActive: true,
      credentials: {
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          holderDID: true,
          issuedAt: true,
          status: true,
        },
      },
    },
  })

  return holders.map((holder) => {
    const latestCredential = holder.credentials[0]
    const holderDid = latestCredential?.holderDID || null

    return {
      id: holder.id,
      nik: holder.nik,
      email: holder.email,
      nama: holder.nama || holder.fullName,
      isActive: holder.isActive,
      holderDID: holderDid,
      credentialCount: holder.credentials.length,
      lastIssuedAt: latestCredential?.issuedAt || null,
      credentials: holder.credentials,
    }
  })
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
        nik: true,
        nama: true,
        format: true,
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
 * Search credentials
 */
export async function searchCredentials(query: string) {
  return prisma.credential.findMany({
    where: {
      OR: [
        { holderName: { contains: query, mode: 'insensitive' } },
        { nik: { contains: query } },
        { nama: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { issuedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      holderName: true,
      holderDID: true,
      nik: true,
      nama: true,
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
    totalUsers,
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
    prisma.user.count({
      where: {
        OR: [{ userType: 'HOLDER' }, { nik: { not: null } }],
      },
    }),
  ])

  return {
    totalCredentials,
    activeCredentials,
    revokedCredentials,
    expiredCredentials,
    todayIssued,
    totalUsers,
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
