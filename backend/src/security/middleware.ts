/**
 * Security Middleware — Headers, Rate Limiting, CORS, Sanitization, Audit
 * 
 * Migrated from the original security.middleware.ts with cleanup
 */

import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

// ============================================
// IP Blacklist & Rate Limiting
// ============================================

const blacklistedIPs = new Set<string>()
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
const RATE_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000

// ============================================
// Input Sanitization — Prevent SQL/XSS Injection
// ============================================

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str
    str = str.replace(/<[^>]*>/g, '')
    str = str.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|SCRIPT)\b)/gi, '')
    str = str.replace(/javascript:/gi, '')
    str = str.replace(/on\w+\s*=/gi, '')
    if (str.length > 1000) str = str.substring(0, 1000)
    return str.trim()
  }

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') return sanitizeString(obj)
    if (Array.isArray(obj)) return obj.map(sanitizeObject)
    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key])
        }
      }
      return sanitized
    }
    return obj
  }

  if (req.body) req.body = sanitizeObject(req.body)
  if (req.query) req.query = sanitizeObject(req.query)
  if (req.params) req.params = sanitizeObject(req.params)

  next()
}

// ============================================
// Rate Limiting — Prevent brute force & DDoS
// ============================================

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()

  if (blacklistedIPs.has(ip)) {
    return res.status(403).json({ error: 'Access denied — IP blacklisted' })
  }

  let rateData = rateLimitMap.get(ip)
  if (!rateData || now > rateData.resetTime) {
    rateData = { count: 0, resetTime: now + RATE_WINDOW }
    rateLimitMap.set(ip, rateData)
  }

  rateData.count++

  if (rateData.count > RATE_LIMIT) {
    if (rateData.count > RATE_LIMIT * 2) {
      blacklistedIPs.add(ip)
      console.error(`🚫 IP blacklisted: ${ip}`)
    }
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000),
    })
  }

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT.toString())
  res.setHeader('X-RateLimit-Remaining', (RATE_LIMIT - rateData.count).toString())
  res.setHeader('X-RateLimit-Reset', new Date(rateData.resetTime).toISOString())

  next()
}

// ============================================
// Security Headers
// ============================================

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'")
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  next()
}

// ============================================
// Audit Logger — Request logging
// ============================================

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const timestamp = new Date().toISOString()
  const ip = req.ip || req.socket.remoteAddress
  const method = req.method
  const path = req.path

  // Only log non-health-check requests to reduce noise
  if (path !== '/health') {
    console.log(`[${timestamp}] ${method} ${path} — IP: ${ip}`)
  }

  next()
}

// ============================================
// Cleanup expired rate limits & tokens periodically
// ============================================

setInterval(() => {
  const now = Date.now()
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) rateLimitMap.delete(ip)
  }
}, 3600000)
