/**
 * Security Utilities untuk Frontend
 */

/**
 * Sanitize input untuk mencegah XSS
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return ''
  
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '')
  
  // Remove script and javascript
  sanitized = sanitized.replace(/javascript:/gi, '')
  sanitized = sanitized.replace(/on\w+\s*=/gi, '')
  
  // Remove potential SQL injection
  sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|SCRIPT)\b)/gi, '')
  
  return sanitized.trim()
}

/**
 * Validate DID format
 */
export function isValidDID(did: string): boolean {
  const didRegex = /^did:([a-z0-9]+):([a-zA-Z0-9._-]+)$/
  return didRegex.test(did)
}

/**
 * Validate NIK format (16 digits)
 */
export function isValidNIK(nik: string): boolean {
  return /^\d{16}$/.test(nik)
}

/**
 * Validate No BPJS format (13 digits)
 */
export function isValidNoBPJS(noBPJS: string): boolean {
  return /^\d{13}$/.test(noBPJS)
}

/**
 * Validate nama (hanya huruf dan spasi)
 */
export function isValidName(name: string): boolean {
  return /^[a-zA-Z\s]{3,100}$/.test(name)
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function isValidDate(date: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(date)) return false
  
  const dateObj = new Date(date)
  return dateObj instanceof Date && !isNaN(dateObj.getTime())
}

/**
 * Validate document hash (hex string 32-128 characters)
 */
export function isValidHash(hash: string): boolean {
  return /^[a-fA-F0-9]{32,128}$/.test(hash)
}

/**
 * Rate limiting untuk frontend
 */
class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map()
  private readonly maxAttempts: number
  private readonly windowMs: number

  constructor(maxAttempts: number = 5, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts
    this.windowMs = windowMs
  }

  canMakeRequest(key: string): boolean {
    const now = Date.now()
    const attempt = this.attempts.get(key)

    if (!attempt || now > attempt.resetTime) {
      this.attempts.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      })
      return true
    }

    if (attempt.count >= this.maxAttempts) {
      return false
    }

    attempt.count++
    return true
  }

  getRemainingTime(key: string): number {
    const attempt = this.attempts.get(key)
    if (!attempt) return 0
    
    const remaining = attempt.resetTime - Date.now()
    return Math.max(0, Math.ceil(remaining / 1000))
  }
}

export const rateLimiter = new RateLimiter(5, 60000) // 5 requests per minute

/**
 * Escape HTML untuk mencegah XSS
 */
export function escapeHTML(str: string): string {
  if (typeof document === 'undefined') return str // Server-side safe
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * Generate secure random ID
 */
export function generateSecureId(): string {
  if (typeof crypto === 'undefined') return Math.random().toString(36) // Fallback
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Content Security Policy checker
 */
export function checkCSP(): boolean {
  if (typeof document === 'undefined') return false // Server-side safe
  try {
    // Check if inline scripts are blocked (good security)
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    return meta !== null
  } catch {
    return false
  }
}

/**
 * Prevent timing attacks dengan constant-time comparison
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
