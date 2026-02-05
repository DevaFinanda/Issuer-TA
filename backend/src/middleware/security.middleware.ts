import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

/**
 * Security Middleware untuk melindungi Issuer dari berbagai serangan
 */

// Daftar IP yang diblacklist (bisa diload dari database)
const blacklistedIPs = new Set<string>()

// Rate limiting per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 100 // maksimal request per window
const RATE_WINDOW = 15 * 60 * 1000 // 15 menit

// Daftar API keys yang valid (untuk production gunakan database)
const validApiKeys = new Set<string>([
  process.env.ADMIN_API_KEY || 'change-this-in-production'
])

/**
 * Input Sanitization - Mencegah SQL/NoSQL/XSS Injection
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str
    
    // Remove HTML tags
    str = str.replace(/<[^>]*>/g, '')
    
    // Remove SQL injection patterns
    str = str.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|SCRIPT)\b)/gi, '')
    
    // Remove script tags and javascript
    str = str.replace(/javascript:/gi, '')
    str = str.replace(/on\w+\s*=/gi, '')
    
    // Limit length
    if (str.length > 1000) {
      str = str.substring(0, 1000)
    }
    
    return str.trim()
  }

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj)
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject)
    }
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

  if (req.body) {
    req.body = sanitizeObject(req.body)
  }
  if (req.query) {
    req.query = sanitizeObject(req.query)
  }
  if (req.params) {
    req.params = sanitizeObject(req.params)
  }

  next()
}

/**
 * Input Validation - Memvalidasi format data
 */
export function validateCredentialInput(req: Request, res: Response, next: NextFunction) {
  const { documentId, documentHash, holderDID, holderName, noBPJS, nik, tanggalLahir, alamat } = req.body

  const errors: string[] = []

  // Validate documentId
  if (!documentId || typeof documentId !== 'string' || documentId.length < 3 || documentId.length > 100) {
    errors.push('Invalid documentId format')
  }

  // Validate documentHash
  if (!documentHash || typeof documentHash !== 'string' || !/^[a-fA-F0-9]{32,128}$/.test(documentHash)) {
    errors.push('Invalid documentHash format (must be hex string)')
  }

  // Validate DID format
  if (!holderDID || !holderDID.startsWith('did:')) {
    errors.push('Invalid DID format (must start with "did:")')
  }

  // Validate nama (hanya huruf dan spasi)
  if (!holderName || !/^[a-zA-Z\s]{3,100}$/.test(holderName)) {
    errors.push('Invalid holderName (only letters and spaces, 3-100 chars)')
  }

  // Validate No BPJS (13 digit angka)
  if (!noBPJS || !/^\d{13}$/.test(noBPJS)) {
    errors.push('Invalid noBPJS (must be 13 digits)')
  }

  // Validate NIK (16 digit angka)
  if (!nik || !/^\d{16}$/.test(nik)) {
    errors.push('Invalid NIK (must be 16 digits)')
  }

  // Validate tanggal lahir (format ISO date)
  if (!tanggalLahir || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) {
    errors.push('Invalid tanggalLahir (must be YYYY-MM-DD)')
  }

  // Validate alamat
  if (!alamat || typeof alamat !== 'string' || alamat.length < 10 || alamat.length > 500) {
    errors.push('Invalid alamat (10-500 characters)')
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    })
  }

  next()
}

/**
 * Rate Limiting - Mencegah brute force dan DDoS
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()

  // Check blacklist
  if (blacklistedIPs.has(ip)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied - IP blacklisted'
    })
  }

  // Get or create rate limit entry
  let rateData = rateLimitMap.get(ip)
  
  if (!rateData || now > rateData.resetTime) {
    rateData = {
      count: 0,
      resetTime: now + RATE_WINDOW
    }
    rateLimitMap.set(ip, rateData)
  }

  rateData.count++

  // Check if limit exceeded
  if (rateData.count > RATE_LIMIT) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`)
    
    // Auto-blacklist after excessive requests
    if (rateData.count > RATE_LIMIT * 2) {
      blacklistedIPs.add(ip)
      console.error(`🚫 IP blacklisted: ${ip}`)
    }

    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000)
    })
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT.toString())
  res.setHeader('X-RateLimit-Remaining', (RATE_LIMIT - rateData.count).toString())
  res.setHeader('X-RateLimit-Reset', new Date(rateData.resetTime).toISOString())

  next()
}

/**
 * API Key Authentication - Proteksi endpoint admin
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required'
    })
  }

  if (!validApiKeys.has(apiKey)) {
    console.warn(`⚠️ Invalid API key attempt from ${req.ip}`)
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    })
  }

  next()
}

/**
 * CSRF Protection - Mencegah Cross-Site Request Forgery
 */
const csrfTokens = new Map<string, number>()

export function generateCSRFToken(req: Request, res: Response, next: NextFunction) {
  const token = crypto.randomBytes(32).toString('hex')
  csrfTokens.set(token, Date.now() + 3600000) // Valid for 1 hour
  
  res.setHeader('X-CSRF-Token', token)
  next()
}

export function validateCSRFToken(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }

  const token = req.headers['x-csrf-token'] as string

  if (!token || !csrfTokens.has(token)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing CSRF token'
    })
  }

  const expiry = csrfTokens.get(token)!
  if (Date.now() > expiry) {
    csrfTokens.delete(token)
    return res.status(403).json({
      success: false,
      error: 'CSRF token expired'
    })
  }

  csrfTokens.delete(token) // One-time use
  next()
}

/**
 * Security Headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent XSS attacks
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'")
  
  // Prevent MIME type sniffing
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

  next()
}

/**
 * Request Logger untuk audit trail
 */
export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const timestamp = new Date().toISOString()
  const ip = req.ip || req.socket.remoteAddress
  const method = req.method
  const path = req.path
  const userAgent = req.headers['user-agent']

  console.log(`[${timestamp}] ${method} ${path} - IP: ${ip} - UA: ${userAgent}`)

  // Log sensitive operations
  if (method === 'POST' && path.includes('/api/issue')) {
    console.log(`🔐 Credential issuance request from ${ip}`)
  }

  next()
}

/**
 * DID Validation - Memvalidasi format DID
 */
export function validateDID(did: string): boolean {
  // Format: did:method:identifier
  const didRegex = /^did:([a-z0-9]+):([a-zA-Z0-9._-]+)$/
  return didRegex.test(did)
}

/**
 * Hash Validation - Memvalidasi format hash
 */
export function validateHash(hash: string): boolean {
  // Accept SHA-256, SHA-384, SHA-512 hex format
  return /^[a-fA-F0-9]{64,128}$/.test(hash)
}

/**
 * Credential ID Validation - Mencegah path traversal
 */
export function validateCredentialId(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params

  // Only allow alphanumeric and hyphens
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid credential ID format'
    })
  }

  next()
}

/**
 * Clean up expired tokens dan rate limits
 */
setInterval(() => {
  const now = Date.now()
  
  // Clean CSRF tokens
  for (const [token, expiry] of csrfTokens.entries()) {
    if (now > expiry) {
      csrfTokens.delete(token)
    }
  }
  
  // Clean rate limits
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip)
    }
  }
}, 3600000) // Every hour
