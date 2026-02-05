import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'issuer-secret-key-change-in-production'
const JWT_EXPIRES_IN = '24h'
const SALT_ROUNDS = 12
const MAX_LOGIN_ATTEMPTS = 5
const LOCK_TIME_MINUTES = 15

export interface JWTPayload {
  userId: string
  username: string
  email: string
  role: string
  fullName: string
}

// Hash password menggunakan bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Generate JWT token
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

// Register new user
export async function registerUser(data: {
  username: string
  email: string
  password: string
  fullName: string
}) {
  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: data.username },
        { email: data.email }
      ]
    }
  })

  if (existingUser) {
    if (existingUser.username === data.username) {
      throw new Error('Username sudah digunakan')
    }
    throw new Error('Email sudah terdaftar')
  }

  // Hash password
  const passwordHash = await hashPassword(data.password)

  // Create user
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      role: 'ADMIN',
    },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
    }
  })

  // Log audit
  await prisma.auditLog.create({
    data: {
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      actorType: 'system',
      actorId: user.id,
      userId: user.id,
      details: { username: user.username, email: user.email },
    }
  })

  return user
}

// Login user
export async function loginUser(username: string, password: string, ipAddress?: string, userAgent?: string) {
  // Find user by username or email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        { email: username }
      ]
    }
  })

  if (!user) {
    throw new Error('Username atau password salah')
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    throw new Error(`Akun terkunci. Coba lagi dalam ${remainingMinutes} menit`)
  }

  // Check if account is active
  if (!user.isActive) {
    throw new Error('Akun tidak aktif. Hubungi administrator')
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash)

  if (!isValid) {
    // Increment login attempts
    const loginAttempts = user.loginAttempts + 1
    const updateData: any = { loginAttempts }

    // Lock account if max attempts reached
    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + LOCK_TIME_MINUTES * 60000)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    })

    // Log failed attempt
    await prisma.auditLog.create({
      data: {
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        actorType: 'user',
        actorId: user.id,
        userId: user.id,
        details: { reason: 'Invalid password', attempts: loginAttempts },
        ipAddress,
        userAgent,
      }
    })

    if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      throw new Error(`Terlalu banyak percobaan login. Akun terkunci selama ${LOCK_TIME_MINUTES} menit`)
    }

    throw new Error('Username atau password salah')
  }

  // Successful login - reset attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    }
  })

  // Log successful login
  await prisma.auditLog.create({
    data: {
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      actorType: 'user',
      actorId: user.id,
      userId: user.id,
      details: { loginTime: new Date().toISOString() },
      ipAddress,
      userAgent,
    }
  })

  // Generate token
  const token = generateToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  })

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    }
  }
}

// Get user by ID
export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    }
  })
}
