/**
 * Input Validation Utilities for OID4VCI Endpoints
 */

function normalizeDidInput(did: string): string {
  return String(did || '').trim().replace(/\/+$/, '')
}

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
 * Validate did:web DID format
 */
export function validateDidWeb(did: string): { valid: boolean; error?: string } {
  if (!did || typeof did !== 'string') {
    return { valid: false, error: 'holderDid is required' }
  }

  const normalized = normalizeDidInput(did)
  if (!normalized) {
    return { valid: false, error: 'holderDid is required' }
  }

  // did:web:<domain>[:path...], domain chars + dots/hyphens, optional path segments
  const didWebRegex = /^did:web:[a-zA-Z0-9.-]+(?::[a-zA-Z0-9._~%-]+)*$/
  if (!didWebRegex.test(normalized)) {
    return { valid: false, error: 'holderDid must be a valid did:web identifier' }
  }

  return { valid: true }
}

/**
 * Validate generic DID format (did:web, did:key, did:ion, etc.)
 */
export function validateDid(did: string): { valid: boolean; error?: string } {
  if (!did || typeof did !== 'string') {
    return { valid: false, error: 'holder_did is required' }
  }

  const normalized = normalizeDidInput(did)
  if (!normalized) {
    return { valid: false, error: 'holder_did is required' }
  }

  if (!/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+(?:[:/][A-Za-z0-9._~:%-]+)*$/i.test(normalized)) {
    return { valid: false, error: 'holder_did must be a valid DID' }
  }

  return { valid: true }
}

/**
 * Validate registration input
 */
export function validateRegistration(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const normalizeBirthDate = (value: string): string | null => {
    const raw = value.trim()

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw
    }

    const localFormat = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (localFormat) {
      const [, dd, mm, yyyy] = localFormat
      return `${yyyy}-${mm}-${dd}`
    }

    return null
  }

  // NIK
  if (!body.nik || typeof body.nik !== 'string') {
    errors.push('NIK wajib diisi')
  } else if (!/^\d{16}$/.test(body.nik)) {
    errors.push('NIK harus tepat 16 digit angka')
  }

  // Nama (optional)
  if (body.nama !== undefined && body.nama !== null) {
    if (typeof body.nama !== 'string' || body.nama.trim().length < 2) {
      errors.push('Nama lengkap minimal 2 karakter jika diisi')
    }
  }

  // Tanggal lahir (optional)
  if (body.tanggal_lahir !== undefined && body.tanggal_lahir !== null && body.tanggal_lahir !== '') {
    const normalizedDate = typeof body.tanggal_lahir === 'string'
      ? normalizeBirthDate(body.tanggal_lahir)
      : null

    if (!normalizedDate) {
      errors.push('Tanggal lahir jika diisi harus format YYYY-MM-DD atau DD/MM/YYYY')
    } else {
      const date = new Date(normalizedDate)
      if (isNaN(date.getTime())) {
        errors.push('Tanggal lahir tidak valid')
      }
    }
  }

  // Email (optional)
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      errors.push('Alamat email tidak valid')
    }
  }

  // Password
  if (!body.password || typeof body.password !== 'string' || body.password.length < 6) {
    errors.push('Password minimal 6 karakter')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate credential request body.
 * holderDid is optional — if omitted the controller will use a default.
 */
export function validateCredentialRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (body.format && body.format !== 'jwt_vc_json') {
    errors.push('format must be "jwt_vc_json"')
  }

  if (body.credential_definition?.type) {
    const types = body.credential_definition.type
    if (!Array.isArray(types) || types.length === 0) {
      errors.push('credential_definition.type must be a non-empty array')
    } else if (!types.every((t: unknown) => typeof t === 'string' && t.trim().length > 0)) {
      errors.push('credential_definition.type must contain non-empty string values')
    }
  }

  // Backward compatible optional DID parameter, but if present it must be valid DID.
  if (body.holderDid || body.holder_did) {
    const didResult = validateDid(String(body.holderDid || body.holder_did))
    if (!didResult.valid) errors.push(didResult.error!)
  }

  // OID4VCI proof-of-possession is mandatory.
  if (!body.proof || typeof body.proof !== 'object') {
    errors.push('proof is required')
  } else {
    if (body.proof.proof_type !== 'jwt') {
      errors.push('proof.proof_type must be "jwt"')
    }

    if (!body.proof.jwt || typeof body.proof.jwt !== 'string') {
      errors.push('proof.jwt is required and must be a JWT string')
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate simple username/password login request
 */
export function validateLoginRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!body.username || typeof body.username !== 'string' || body.username.trim().length < 3) {
    errors.push('username is required and must be at least 3 characters')
  }

  if (!body.password || typeof body.password !== 'string' || body.password.length < 6) {
    errors.push('password must be at least 6 characters')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate token request body
 */
export function validateTokenRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const grantType = String(body.grant_type || '').trim()
  const isAuthCode = grantType === 'authorization_code'
  const isPreAuth = grantType === 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

  if (!isAuthCode && !isPreAuth) {
    errors.push('grant_type must be "authorization_code" or "urn:ietf:params:oauth:grant-type:pre-authorized_code"')
    return { valid: false, errors }
  }

  if (isAuthCode) {
    if (!body.code || typeof body.code !== 'string') {
      errors.push('code is required')
    }

    if (!body.client_id || typeof body.client_id !== 'string') {
      errors.push('client_id is required')
    }
  }

  if (isPreAuth) {
    const preAuthorizedCode = body['pre-authorized_code'] || body.pre_authorized_code
    if (!preAuthorizedCode || typeof preAuthorizedCode !== 'string') {
      errors.push('pre-authorized_code is required')
    }

    const holderDid = String(body.holder_did || body.wallet_did || '').trim()
    if (!holderDid) {
      errors.push('holder_did is required for pre-authorized_code grant')
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate authorize request body.
 * Accepts NIK (16 digit), username, or email as identifier.
 */
export function validateAuthorizeRequest(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const identifier = (body.identifier || body.nik || '').trim()
  if (!identifier || identifier.length < 3) {
    errors.push('NIK / username harus diisi (minimal 3 karakter)')
  }

  if (!body.password || typeof body.password !== 'string') {
    errors.push('Password harus diisi')
  }

  if (!body.client_id || typeof body.client_id !== 'string') {
    errors.push('client_id is required')
  }

  if (!body.redirect_uri || typeof body.redirect_uri !== 'string') {
    errors.push('redirect_uri is required')
  }

  const providedDid = String(body.holder_did || body.wallet_did || '').trim()

  if (providedDid) {
    const didResult = validateDid(providedDid)
    if (!didResult.valid) {
      errors.push(didResult.error || 'holder_did is invalid')
    }
  }

  return { valid: errors.length === 0, errors }
}
