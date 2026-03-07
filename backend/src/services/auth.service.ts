/**
 * Authorization Service — Authorization Code generation and verification
 */

import crypto from 'crypto'
import { prisma, AuditAction } from '../lib/prisma.js'
import { findUserByNIK, verifyPassword } from './user.service.js'

const AUTH_CODE_EXPIRY_MINUTES = 10

/**
 * Authenticate user by NIK + password and generate authorization code
 */
export async function authenticateAndGenerateCode(input: {
  nik: string
  password: string
  clientId: string
  redirectUri: string
  state?: string
}): Promise<{ code: string; redirectUrl: string }> {
  // Find user by NIK
  const user = await findUserByNIK(input.nik)
  if (!user) {
    throw new AuthError('Invalid NIK or password', 401)
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError('Account is temporarily locked. Try again later.', 423)
  }

  // Check if account is active
  if (!user.isActive) {
    throw new AuthError('Account is not active', 403)
  }

  // Verify password
  const passwordValid = await verifyPassword(user.passwordHash, input.password)
  if (!passwordValid) {
    // Increment failed login attempts
    const newAttempts = user.loginAttempts + 1
    const updateData: any = { loginAttempts: newAttempts }

    // Lock account after 5 failed attempts (15 minutes)
    if (newAttempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000)
      console.warn(`🔒 Account locked for NIK: ${input.nik} (${newAttempts} failed attempts)`)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_LOGIN_FAILED,
        entityType: 'User',
        entityId: user.id,
        actorType: 'holder',
        details: { nik: input.nik, attempts: newAttempts } as any,
      },
    })

    throw new AuthError('Invalid NIK or password', 401)
  }

  // Reset login attempts on success
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  })

  // Generate authorization code (32 bytes hex = 64 chars)
  const code = crypto.randomBytes(32).toString('hex')

  // Store authorization code
  const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRY_MINUTES * 60 * 1000)

  await prisma.authorizationCode.create({
    data: {
      code,
      userId: user.id,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      state: input.state,
      expiresAt,
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: AuditAction.AUTHORIZATION_CODE_ISSUED,
      entityType: 'AuthorizationCode',
      actorType: 'holder',
      actorId: user.id,
      details: { clientId: input.clientId } as any,
    },
  })

  // Build redirect URL
  let redirectUrl = `${input.redirectUri}?code=${code}`
  if (input.state) {
    redirectUrl += `&state=${encodeURIComponent(input.state)}`
  }

  console.log('✅ Authorization code issued for user:', user.nik)
  return { code, redirectUrl }
}

/**
 * Verify authorization code and return user info
 */
export async function verifyAuthorizationCode(input: {
  code: string
  clientId: string
}): Promise<{ userId: string; redirectUri: string }> {
  const authCode = await prisma.authorizationCode.findUnique({
    where: { code: input.code },
  })

  if (!authCode) {
    throw new AuthError('Invalid authorization code', 400)
  }

  if (authCode.used) {
    throw new AuthError('Authorization code has already been used', 400)
  }

  if (authCode.expiresAt < new Date()) {
    throw new AuthError('Authorization code has expired', 400)
  }

  if (authCode.clientId !== input.clientId) {
    throw new AuthError('Client ID does not match', 400)
  }

  // Mark code as used
  await prisma.authorizationCode.update({
    where: { code: input.code },
    data: { used: true },
  })

  return {
    userId: authCode.userId,
    redirectUri: authCode.redirectUri,
  }
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

/**
 * Clean up expired authorization codes
 */
export async function cleanupExpiredAuthCodes(): Promise<number> {
  const result = await prisma.authorizationCode.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
  return result.count
}
