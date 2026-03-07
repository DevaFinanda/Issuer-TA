/**
 * Token Service — Access Token generation and verification
 */

import crypto from 'crypto'
import { prisma, AuditAction } from '../lib/prisma.js'

const ACCESS_TOKEN_EXPIRY_SECONDS = 3600 // 1 hour

/**
 * Generate a new access token for a user
 */
export async function generateAccessToken(userId: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  // Generate random access token (64 bytes hex = 128 chars)
  const token = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_SECONDS * 1000)

  // Store in database
  await prisma.accessToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: AuditAction.TOKEN_ISSUED,
      entityType: 'AccessToken',
      actorType: 'system',
      actorId: userId,
      details: { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS } as any,
    },
  })

  console.log('✅ Access token generated for user:', userId)
  return {
    accessToken: token,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
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
    return true
  } catch {
    return false
  }
}

/**
 * Clean up expired access tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.accessToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
  return result.count
}
