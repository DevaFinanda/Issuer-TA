/**
 * Authorization Service — Authorization Code generation and verification
 */

import crypto from 'crypto'
import { prisma, AuditAction } from '../lib/prisma.js'
import { verifyPassword } from './user.service.js'
import bcrypt from 'bcryptjs'
import { normalizeDidForStorage } from '../lib/did.js'

const AUTH_CODE_EXPIRY_MINUTES = 10
const BCRYPT_ROUNDS = 12

function isNikFormat(value: string): boolean {
  return /^\d{16}$/.test(value)
}

function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''))
}

async function findUserByIdentifier(identifier: string) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { nik: identifier },
        { username: identifier },
        { email: identifier.toLowerCase() },
      ],
    },
  })
}

async function createHolderFromRegistryIfAllowed(input: {
  identifier: string
  password: string
}) {
  if (!isNikFormat(input.identifier)) {
    return null
  }

  const registryIdentity = await (prisma as any).trustedRegistryIdentity.findUnique({
    where: { nik: input.identifier },
  })

  if (!registryIdentity || registryIdentity.isActive !== true) {
    return null
  }

  const generatedEmail = `${input.identifier}@holder.identia.local`
  const generatedName = String(registryIdentity.nama || '').trim() || `Pemegang ${input.identifier.slice(-4)}`
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  try {
    const created = await (prisma.user as any).create({
      data: {
        email: generatedEmail,
        passwordHash,
        fullName: generatedName,
        nik: input.identifier,
        nama: generatedName,
        tanggalLahir: registryIdentity.tanggalLahir || null,
        userType: 'HOLDER',
        role: 'OPERATOR',
        onboardingStatus: 'VERIFIED',
        isActive: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_REGISTERED,
        entityType: 'User',
        entityId: created.id,
        actorType: 'holder',
        actorId: created.id,
        details: {
          source: 'registry_auto_provision',
          nik: input.identifier,
        } as any,
      },
    })

    return created
  } catch {
    // Handle race/duplicate gracefully by fetching the row again.
    return findUserByIdentifier(input.identifier)
  }
}

async function verifyAndUpgradePassword(user: {
  id: string
  passwordHash: string
}, plainPassword: string): Promise<boolean> {
  if (isBcryptHash(user.passwordHash)) {
    return verifyPassword(user.passwordHash, plainPassword)
  }

  const legacyValid = user.passwordHash === plainPassword
  if (!legacyValid) {
    return false
  }

  const newHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS)
  await (prisma.user as any).update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  })

  return true
}

/**
 * Authenticate user by NIK + password and generate authorization code
 */
export async function authenticateAndGenerateCode(input: {
  identifier: string   // NIK, username, or email
  password: string
  clientId: string
  redirectUri: string
  holderDid: string
  state?: string
}): Promise<{ code: string; redirectUrl: string; userId: string }> {
  const normalizedHolderDid = normalizeDidForStorage(input.holderDid)
  const normalizedIdentifier = input.identifier.trim()

  // Find user by NIK first, then fall back to username or email.
  // If a trusted registry NIK exists but user row does not, auto-provision holder account.
  const user =
    (await findUserByIdentifier(normalizedIdentifier)) ||
    (await createHolderFromRegistryIfAllowed({
      identifier: normalizedIdentifier,
      password: input.password,
    }))

  if (!user) {
    throw new AuthError('NIK / username atau password salah', 401)
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
  const passwordValid = await verifyAndUpgradePassword(user, input.password)
  if (!passwordValid) {
    // Increment failed login attempts
    const newAttempts = user.loginAttempts + 1
    const updateData: any = { loginAttempts: newAttempts }

    // Lock account after 5 failed attempts (15 minutes)
    if (newAttempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000)
      console.warn(`🔒 Account locked for: ${normalizedIdentifier} (${newAttempts} failed attempts)`)
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
        details: { identifier: normalizedIdentifier, attempts: newAttempts } as any,
      },
    })

    throw new AuthError('NIK / username atau password salah', 401)
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

  await prisma.issuerConfig.upsert({
    where: { key: `auth-code-meta:${code}` },
    update: {
      value: JSON.stringify({
        holderDid: normalizedHolderDid,
        clientId: input.clientId,
        userId: user.id,
        createdAt: new Date().toISOString(),
      }),
      description: 'OID4VCI authorization code metadata',
    },
    create: {
      key: `auth-code-meta:${code}`,
      value: JSON.stringify({
        holderDid: normalizedHolderDid,
        clientId: input.clientId,
        userId: user.id,
        createdAt: new Date().toISOString(),
      }),
      description: 'OID4VCI authorization code metadata',
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
  return { code, redirectUrl, userId: user.id }
}

/**
 * Authenticate using username/email/NIK + password.
 * This supports the simple POST /login flow used before credential issuance.
 */
export async function authenticateUserLogin(input: {
  username: string
  password: string
}): Promise<{ userId: string; displayName: string; studentId: string }> {
  const loginId = input.username.trim()

  const user =
    (await findUserByIdentifier(loginId)) ||
    (await createHolderFromRegistryIfAllowed({
      identifier: loginId,
      password: input.password,
    }))

  if (!user) {
    throw new AuthError('Invalid username or password', 401)
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError('Account is temporarily locked. Try again later.', 423)
  }

  if (!user.isActive) {
    throw new AuthError('Account is not active', 403)
  }

  const passwordValid = await verifyAndUpgradePassword(user, input.password)
  if (!passwordValid) {
    const newAttempts = user.loginAttempts + 1
    const updateData: { loginAttempts: number; lockedUntil?: Date } = { loginAttempts: newAttempts }

    if (newAttempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    })

    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_LOGIN_FAILED,
        entityType: 'User',
        entityId: user.id,
        actorType: 'holder',
        details: { username: loginId, attempts: newAttempts } as any,
      },
    })

    throw new AuthError('Invalid username or password', 401)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  })

  await prisma.auditLog.create({
    data: {
      action: AuditAction.USER_LOGIN,
      entityType: 'User',
      entityId: user.id,
      actorType: 'holder',
      actorId: user.id,
      details: { username: loginId } as any,
    },
  })

  return {
    userId: user.id,
    displayName: user.nama || user.fullName,
    studentId: user.nik || user.username || user.id,
  }
}

/**
 * Verify authorization code and return user info
 */
export async function verifyAuthorizationCode(input: {
  code: string
  clientId: string
}): Promise<{ userId: string; redirectUri: string; holderDid: string }> {
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

  const metadataRecord = await prisma.issuerConfig.findUnique({
    where: { key: `auth-code-meta:${input.code}` },
    select: { value: true },
  })

  if (!metadataRecord?.value) {
    throw new AuthError('Authorization code metadata not found', 400)
  }

  let metadata: { holderDid?: string; clientId?: string }
  try {
    metadata = JSON.parse(metadataRecord.value)
  } catch {
    throw new AuthError('Invalid authorization code metadata', 400)
  }

  const metadataHolderDid = metadata.holderDid ? normalizeDidForStorage(metadata.holderDid) : ''

  if (!metadataHolderDid) {
    throw new AuthError('Authorization code is not bound to holder DID', 400)
  }

  if (metadata.clientId && metadata.clientId !== input.clientId) {
    throw new AuthError('Client ID metadata mismatch', 400)
  }

  // Mark code as used
  await prisma.authorizationCode.update({
    where: { code: input.code },
    data: { used: true },
  })

  await prisma.issuerConfig.delete({
    where: { key: `auth-code-meta:${input.code}` },
  }).catch(() => undefined)

  return {
    userId: authCode.userId,
    redirectUri: authCode.redirectUri,
    holderDid: metadataHolderDid,
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
