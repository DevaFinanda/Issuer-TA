/**
 * Token Service — Access Token generation and verification
 */

import crypto from 'crypto'
import { prisma, AuditAction } from '../lib/prisma.js'
import { normalizeDidForStorage } from '../lib/did.js'

const ACCESS_TOKEN_EXPIRY_SECONDS = 3600 // 1 hour

/**
 * Generate a new access token for a user
 */
export async function generateAccessToken(userId: string, holderDid?: string): Promise<{
  accessToken: string
  expiresIn: number
  cNonce: string
  cNonceExpiresIn: number
}> {
    const normalizedHolderDid = holderDid ? normalizeDidForStorage(holderDid) : null

  // Generate random access token (64 bytes hex = 128 chars)
  const token = crypto.randomBytes(64).toString('hex')
  const cNonce = crypto.randomBytes(16).toString('hex')
  const cNonceExpiresIn = ACCESS_TOKEN_EXPIRY_SECONDS
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_SECONDS * 1000)

  // Store in database
  await prisma.accessToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  })

  // Persist nonce + DID binding metadata (OID4VCI token context)
  await prisma.issuerConfig.upsert({
    where: { key: `access-token-meta:${token}` },
    update: {
      value: JSON.stringify({
        cNonce,
        cNonceExpiresIn,
        userId,
        holderDid: normalizedHolderDid,
        createdAt: new Date().toISOString(),
      }),
      description: 'OID4VCI access token metadata',
    },
    create: {
      key: `access-token-meta:${token}`,
      value: JSON.stringify({
        cNonce,
        cNonceExpiresIn,
        userId,
        holderDid: normalizedHolderDid,
        createdAt: new Date().toISOString(),
      }),
      description: 'OID4VCI access token metadata',
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: AuditAction.TOKEN_ISSUED,
      entityType: 'AccessToken',
      actorType: 'system',
      actorId: userId,
      details: { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS, cNonce } as any,
    },
  })

  console.log('✅ Access token generated for user:', userId)
  return {
    accessToken: token,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    cNonce,
    cNonceExpiresIn,
  }
}

export async function attachDidToAccessToken(token: string, holderDid: string): Promise<void> {
  const metadataRecord = await prisma.issuerConfig.findUnique({
    where: { key: `access-token-meta:${token}` },
    select: { value: true },
  })

  if (!metadataRecord?.value) {
    throw new Error('Access token metadata not found')
  }

  let metadata: Record<string, unknown> = {}
  try {
    metadata = JSON.parse(metadataRecord.value)
  } catch {
    metadata = {}
  }

  metadata.holderDid = normalizeDidForStorage(holderDid)
  metadata.updatedAt = new Date().toISOString()

  await prisma.issuerConfig.update({
    where: { key: `access-token-meta:${token}` },
    data: { value: JSON.stringify(metadata) },
  })
}

export async function getAccessTokenContext(token: string): Promise<{
  valid: boolean
  userId?: string
  holderDid?: string
  cNonce?: string
}> {
  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
  })

  if (!accessToken || accessToken.revoked || accessToken.expiresAt < new Date()) {
    return { valid: false }
  }

  const metadataRecord = await prisma.issuerConfig.findUnique({
    where: { key: `access-token-meta:${token}` },
    select: { value: true },
  })

  if (!metadataRecord?.value) {
    return { valid: false }
  }

  try {
    const metadata = JSON.parse(metadataRecord.value) as {
      holderDid?: string
      cNonce?: string
      userId?: string
    }

    return {
      valid: !!(metadata.cNonce && metadata.holderDid),
      userId: accessToken.userId,
      holderDid: metadata.holderDid,
      cNonce: metadata.cNonce,
    }
  } catch {
    return { valid: false }
  }
}

export async function rotateTokenNonce(token: string): Promise<{ cNonce: string; cNonceExpiresIn: number }> {
  const metadataRecord = await prisma.issuerConfig.findUnique({
    where: { key: `access-token-meta:${token}` },
    select: { value: true },
  })

  if (!metadataRecord?.value) {
    throw new Error('Access token metadata not found')
  }

  let metadata: Record<string, unknown>
  try {
    metadata = JSON.parse(metadataRecord.value)
  } catch {
    throw new Error('Invalid access token metadata')
  }

  const cNonce = crypto.randomBytes(16).toString('hex')
  metadata.cNonce = cNonce
  metadata.cNonceExpiresIn = ACCESS_TOKEN_EXPIRY_SECONDS
  metadata.updatedAt = new Date().toISOString()

  await prisma.issuerConfig.update({
    where: { key: `access-token-meta:${token}` },
    data: {
      value: JSON.stringify(metadata),
      description: 'OID4VCI access token metadata (nonce rotated)',
    },
  })

  return {
    cNonce,
    cNonceExpiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  }
}

/**
 * Verify access token and return user ID
 */
export async function verifyAccessToken(token: string): Promise<{
  userId: string
  valid: boolean
}> {
  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
  })

  if (!accessToken) {
    return { userId: '', valid: false }
  }

  if (accessToken.revoked || accessToken.expiresAt < new Date()) {
    return { userId: '', valid: false }
  }

  return { userId: accessToken.userId, valid: true }
}

/**
 * Revoke an access token
 */
export async function revokeAccessToken(token: string): Promise<boolean> {
  try {
    await prisma.accessToken.update({
      where: { token },
      data: { revoked: true },
    })

    await prisma.issuerConfig.delete({
      where: { key: `access-token-meta:${token}` },
    }).catch(() => undefined)

    return true
  } catch {
    return false
  }
}

/**
 * Clean up expired access tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const expiredTokens = await prisma.accessToken.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
    select: { token: true },
  })

  const result = await prisma.accessToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })

  if (expiredTokens.length > 0) {
    const metadataKeys = expiredTokens.map((item) => `access-token-meta:${item.token}`)
    await prisma.issuerConfig.deleteMany({
      where: {
        key: { in: metadataKeys },
      },
    })
  }

  return result.count
}
