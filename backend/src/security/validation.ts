/**
 * Input Validation Utilities for OID4VCI Endpoints
 */

/**
 * Validate NIK (Nomor Induk Kependudukan) — must be exactly 16 digits
 */
export function validateNIK(nik: string): { valid: boolean; error?: string } {
  if (!nik || typeof nik !== 'string') {
    return { valid: false, error: 'NIK is required' }
  }
  if (!/^\d{16}$/.test(nik)) {
    return { valid: false, error: 'NIK must be exactly 16 digits' }
  }
  return { valid: true }
}

/**
 * Validate registration input
 */
export function validateRegistration(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // NIK
  const nikResult = validateNIK(body.nik)
  if (!nikResult.valid) errors.push(nikResult.error!)

  // Nama
  if (!body.nama || typeof body.nama !== 'string' || body.nama.trim().length < 2) {
    errors.push('Nama must be at least 2 characters')
  }

  // Tanggal lahir
  if (!body.tanggal_lahir || !/^\d{4}-\d{2}-\d{2}$/.test(body.tanggal_lahir)) {
    errors.push('Tanggal lahir must be in YYYY-MM-DD format')
  } else {
    const date = new Date(body.tanggal_lahir)
    if (isNaN(date.getTime())) {
      errors.push('Tanggal lahir is not a valid date')
    }
  }

  // Email
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push('Valid email is required')
  }

  // Password
  if (!body.password || typeof body.password !== 'string' || body.password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate credential request body
 */
export function validateCredentialRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!body.format || body.format !== 'jwt_vc_json') {
    errors.push('format must be "jwt_vc_json"')
  }

  if (!body.credential_definition || !body.credential_definition.type) {
    errors.push('credential_definition.type is required')
  } else {
    const types = body.credential_definition.type
    if (!Array.isArray(types) || !types.includes('VerifiableCredential') || !types.includes('IdentityCredential')) {
      errors.push('credential_definition.type must include "VerifiableCredential" and "IdentityCredential"')
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate token request body
 */
export function validateTokenRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!body.grant_type || body.grant_type !== 'authorization_code') {
    errors.push('grant_type must be "authorization_code"')
  }

  if (!body.code || typeof body.code !== 'string') {
    errors.push('code is required')
  }

  if (!body.client_id || typeof body.client_id !== 'string') {
    errors.push('client_id is required')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate authorize request body
 */
export function validateAuthorizeRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const nikResult = validateNIK(body.nik)
  if (!nikResult.valid) errors.push(nikResult.error!)

  if (!body.password || typeof body.password !== 'string') {
    errors.push('Password is required')
  }

  if (!body.client_id || typeof body.client_id !== 'string') {
    errors.push('client_id is required')
  }

  if (!body.redirect_uri || typeof body.redirect_uri !== 'string') {
    errors.push('redirect_uri is required')
  }

  return { valid: errors.length === 0, errors }
}
