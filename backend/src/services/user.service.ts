/**
 * User Service — Registration and lookup by NIK
 */

import { prisma, AuditAction } from '../lib/prisma.js'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

function normalizeDid(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  return withoutTrailingSlash.toLowerCase()
}

function getSharedHolderDidSet(): Set<string> {
  const configured = String(process.env.SHARED_HOLDER_DIDS || 'did:web:wallet.identia.my.id')
    .split(',')
    .map((item) => normalizeDid(item))
    .filter(Boolean)

  return new Set(configured)
}

function isSharedHolderDid(holderDid: string): boolean {
  return getSharedHolderDidSet().has(normalizeDid(holderDid))
}

function allowDidRebindForAuthenticatedUser(): boolean {
  // For this issuer flow, authenticated account ownership is treated as
  // the strongest signal, so DID rebinding is always allowed.
  return true
}

function allowCrossUserDidRebind(): boolean {
  const raw = String(process.env.ALLOW_CROSS_USER_DID_REBIND || 'true').trim().toLowerCase()
  return raw !== 'false'
}

/**
 * Register a new holder user
 */
export async function registerHolder(input: {
  nik: string
  nama?: string
  tanggalLahir?: string
  email?: string
  password: string
}): Promise<{ userId: string; created: boolean }> {
  // Check if NIK already exists
  const existingNik = await prisma.user.findUnique({
    where: { nik: input.nik },
  })

  const normalizedNama = (input.nama || '').trim()
  const resolvedNama = normalizedNama || `Pemegang ${input.nik.slice(-4)}`
  const normalizedEmail = (input.email || '').trim().toLowerCase()
  const resolvedEmail = normalizedEmail || `${input.nik}@holder.identia.local`

  // Check if email already exists (including auto-generated fallback)
  const existingEmail = await prisma.user.findUnique({
    where: { email: resolvedEmail },
  })
  if (existingEmail && existingEmail.id !== existingNik?.id) {
    throw new Error('Email already registered')
  }

  // Hash password with bcrypt
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  if (existingNik) {
    const user = await (prisma.user as any).update({
      where: { id: existingNik.id },
      data: {
        email: resolvedEmail,
        passwordHash,
        fullName: resolvedNama,
        nama: resolvedNama,
        tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : null,
        onboardingStatus: 'PENDING_VERIFICATION',
        isActive: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: AuditAction.USER_UPDATED,
        entityType: 'User',
        entityId: user.id,
        actorType: 'holder',
        actorId: user.id,
        details: { nik: input.nik, nama: resolvedNama, source: 'register_sync' } as any,
      },
    })

    console.log('♻️ Holder profile synced:', input.nik, resolvedNama)
    return { userId: user.id, created: false }
  }

  // Create user
  const user = await (prisma.user as any).create({
    data: {
      email: resolvedEmail,
      passwordHash,
      fullName: resolvedNama,
      nik: input.nik,
      nama: resolvedNama,
      tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : null,
      userType: 'HOLDER',
      role: 'OPERATOR',
      onboardingStatus: 'PENDING_VERIFICATION',
      isActive: true,
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: AuditAction.USER_REGISTERED,
      entityType: 'User',
      entityId: user.id,
      actorType: 'holder',
      actorId: user.id,
      details: { nik: input.nik, nama: resolvedNama } as any,
    },
  })

  console.log('✅ Holder registered:', input.nik, resolvedNama)
  return { userId: user.id, created: true }
}

/**
 * Find user by NIK
 */
export async function findUserByNIK(nik: string) {
  return prisma.user.findUnique({
    where: { nik },
  })
}

/**
 * Find user by ID
 */
export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
  })
}

/**
 * Verify user password
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

function userDidBindingKey(userId: string) {
  return `user-did-binding:${userId}`
}

function didUserBindingKey(holderDid: string) {
  return `did-user-binding:${normalizeDid(holderDid)}`
}

export class DidBindingConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DidBindingConflictError'
  }
}

/**
 * Bind an authenticated user account to holder DID.
 * This keeps DID as primary SSI identity while username/password is bootstrap only.
 */
export async function bindUserDid(userId: string, holderDid: string): Promise<void> {
  const normalizedHolderDid = normalizeDid(holderDid)
  if (!normalizedHolderDid) {
    throw new DidBindingConflictError('holder DID tidak valid')
  }

  const now = new Date().toISOString()
  const sharedDid = isSharedHolderDid(normalizedHolderDid)
  const allowRebind = allowDidRebindForAuthenticatedUser()
  const allowCrossRebind = allowCrossUserDidRebind()

  const [boundDidForUser, boundUserForDid] = await Promise.all([
    getBoundDidForUser(userId),
    getUserIdByDid(normalizedHolderDid),
  ])

  // One user must keep a stable DID binding in this issuer to avoid cross-account VC leakage.
  const existingDidIsShared = boundDidForUser ? isSharedHolderDid(boundDidForUser) : false

  // Clean old reverse mapping when account DID is changed, so future users are
  // not blocked by stale did-user-binding entries.
  if (boundDidForUser && normalizeDid(boundDidForUser) !== normalizedHolderDid && allowRebind && !existingDidIsShared) {
    await prisma.issuerConfig.deleteMany({
      where: {
        key: didUserBindingKey(boundDidForUser),
        value: userId,
      },
    })
  }

  // One DID must not be shared/rebound across multiple users.
  if (!sharedDid && boundUserForDid && boundUserForDid !== userId) {
    if (allowCrossRebind) {
      // Reassign DID ownership to the newly authenticated account.
      await prisma.issuerConfig.deleteMany({
        where: {
          key: userDidBindingKey(boundUserForDid),
          value: normalizedHolderDid,
        },
      })
    } else {
    console.warn('⚠️ did_binding_conflict', {
      userId,
      holderDid: normalizedHolderDid,
      boundUserForDid,
      boundDidForUser,
      sharedDid,
      allowRebind,
      allowCrossRebind,
    })
    throw new DidBindingConflictError('DID wallet ini sudah terikat ke akun lain. Gunakan wallet profile/DID yang sesuai dengan akun ini.')
    }
  }

  await prisma.issuerConfig.upsert({
    where: { key: userDidBindingKey(userId) },
    update: {
      value: normalizedHolderDid,
      description: `holder DID binding updated at ${now}`,
    },
    create: {
      key: userDidBindingKey(userId),
      value: normalizedHolderDid,
      description: `holder DID binding created at ${now}`,
    },
  })

  if (!sharedDid) {
    await prisma.issuerConfig.upsert({
      where: { key: didUserBindingKey(normalizedHolderDid) },
      update: {
        value: userId,
        description: `holder DID reverse binding updated at ${now}`,
      },
      create: {
        key: didUserBindingKey(normalizedHolderDid),
        value: userId,
        description: `holder DID reverse binding created at ${now}`,
      },
    })
  }
}

export async function getBoundDidForUser(userId: string): Promise<string | null> {
  const record = await prisma.issuerConfig.findUnique({
    where: { key: userDidBindingKey(userId) },
    select: { value: true },
  })

  return record?.value || null
}

export async function getUserIdByDid(holderDid: string): Promise<string | null> {
  const normalizedHolderDid = normalizeDid(holderDid)
  if (!normalizedHolderDid || isSharedHolderDid(normalizedHolderDid)) {
    return null
  }

  const record = await prisma.issuerConfig.findUnique({
    where: { key: didUserBindingKey(normalizedHolderDid) },
    select: { value: true },
  })

  return record?.value || null
}

export async function setUserOnboardingStatus(
  userId: string,
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
): Promise<void> {
  await (prisma.user as any).update({
    where: { id: userId },
    data: { onboardingStatus: status },
  })
}
