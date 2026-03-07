/**
 * User Service — Registration and lookup by NIK
 */

import { prisma, AuditAction } from '../lib/prisma.js'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

/**
 * Register a new holder user
 */
export async function registerHolder(input: {
  nik: string
  nama: string
  tanggalLahir: string
  email: string
  password: string
}): Promise<{ userId: string }> {
  // Check if NIK already exists
  const existingNik = await prisma.user.findUnique({
    where: { nik: input.nik },
  })
  if (existingNik) {
    throw new Error('NIK already registered')
  }

  // Check if email already exists
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.email },
  })
  if (existingEmail) {
    throw new Error('Email already registered')
  }

  // Hash password with bcrypt
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  // Create user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.nama,
      nik: input.nik,
      nama: input.nama,
      tanggalLahir: new Date(input.tanggalLahir),
      userType: 'HOLDER',
      role: 'OPERATOR',
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
      details: { nik: input.nik, nama: input.nama } as any,
    },
  })

  console.log('✅ Holder registered:', input.nik, input.nama)
  return { userId: user.id }
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
