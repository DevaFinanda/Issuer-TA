/**
 * Authentication Guards — Bearer Token & API Key verification middleware
 */

import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'

// ============================================
// Bearer Token Verification (for OID4VCI credential endpoint)
// ============================================

export async function requireBearerToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Bearer access token is required',
    })
  }

  const token = authHeader.substring(7) // Remove "Bearer " prefix

  try {
    const accessToken = await prisma.accessToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!accessToken) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Access token not found',
      })
    }

    if (accessToken.revoked) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Access token has been revoked',
      })
    }

    if (accessToken.expiresAt < new Date()) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Access token has expired',
      })
    }

    // Attach user info to request
    req.userId = accessToken.userId
    req.userNik = accessToken.user.nik || undefined

    next()
  } catch (error: any) {
    console.error('❌ Token verification error:', error.message)
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to verify access token',
    })
  }
}

// ============================================
// API Key Verification (for admin endpoints)
// ============================================

const validApiKeys = new Set<string>([
  process.env.ADMIN_API_KEY || 'change-this-in-production',
])

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
    })
  }

  if (!validApiKeys.has(apiKey)) {
    console.warn(`⚠️ Invalid API key attempt from ${req.ip}`)
    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
    })
  }

  next()
}
