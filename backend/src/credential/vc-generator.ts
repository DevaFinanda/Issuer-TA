/**
 * JWT Verifiable Credential Generator
 * 
 * Creates and signs W3C Verifiable Credentials in jwt_vc_json format
 * using Ed25519 (EdDSA) via the did-jwt-vc library.
 *
 * Issuer identity: did:web — public key resolvable via /.well-known/did.json
 * JWT header `kid` is set to `<did>#key-1` so verifiers can fetch the public key.
 */

import { createVerifiableCredentialJwt } from 'did-jwt-vc'
import { EdDSASigner } from 'did-jwt'
import crypto from 'crypto'
import { ISSUER_DID, SIGNING_KID } from '../lib/issuer-url.js'

function decodeBase64UrlJson<T = Record<string, unknown>>(part: string): T {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const json = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(json) as T
}

function normalizeCredentialId(inputId?: string): string {
  const trimmed = String(inputId || '').trim()
  if (!trimmed) {
    return `urn:uuid:${crypto.randomUUID()}`
  }

  if (trimmed.startsWith('urn:uuid:')) {
    return trimmed
  }

  return `urn:uuid:${trimmed}`
}

function assertSignedJwtVcIntegrity(signedJwt: string): void {
  const parts = signedJwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Generated credential is not a valid JWT compact string')
  }

  const payload = decodeBase64UrlJson<Record<string, unknown>>(parts[1])
  const jti = typeof payload.jti === 'string' ? payload.jti : ''
  const vc = (payload.vc && typeof payload.vc === 'object')
    ? payload.vc as Record<string, unknown>
    : {}
  const vcId = typeof vc.id === 'string' ? vc.id : ''

  if (!jti) {
    throw new Error('Generated JWT VC is missing jti claim')
  }

  if (!vcId) {
    throw new Error('Generated JWT VC is missing vc.id claim')
  }

  if (jti !== vcId) {
    throw new Error(`Generated JWT VC has jti/vc.id mismatch (jti: ${jti}, vc.id: ${vcId})`)
  }
}

// ============================================
// KEY MANAGEMENT
// ============================================

let issuerDID: string = ''
let issuerKid: string = ''
let signer: any = null

/**
 * Initialize the VC generator with the issuer's signing key and DID
 */
export function initVCGenerator(config: {
  privateKeyHex: string
  did: string
}) {
  if (config.did && config.did !== ISSUER_DID) {
    console.warn(`⚠️ Ignoring non-canonical DID from initVCGenerator: ${config.did}`)
  }

  issuerDID = ISSUER_DID
  // kid references the verification method in the DID Document
  issuerKid = SIGNING_KID

  // Extract raw 32-byte Ed25519 private key
  const hexBuffer = Buffer.from(config.privateKeyHex, 'hex')
  let rawKey: Buffer

  if (hexBuffer.length === 48) {
    // PKCS8 encoded — last 32 bytes are the raw key
    rawKey = hexBuffer.subarray(16, 48)
  } else if (hexBuffer.length === 32) {
    rawKey = hexBuffer
  } else {
    throw new Error(`Invalid PRIVATE_KEY_HEX length: ${hexBuffer.length} bytes. Expected 32 or 48.`)
  }

  signer = EdDSASigner(rawKey)
  console.log('🔐 VC Generator initialized with EdDSA signer')
  console.log(`🌐 Issuer DID   : ${issuerDID}`)
  console.log(`🔑 Signing kid  : ${issuerKid}`)
}

/**
 * Get the issuer DID
 */
export function getIssuerDID(): string {
  return issuerDID
}

/**
 * Create and sign a JWT Verifiable Credential (jwt_vc_json format)
 * 
 * Follows W3C VC Data Model with JWT encoding.
 * Signed using EdDSA (Ed25519).
 * 
 * @param subject - The credential subject data (holderName, nik, noBPJS, tanggalLahir)
 * @param holderDID - Optional holder DID for the `sub` claim
 * @returns Signed JWT string
 */
export async function createSignedVC(
  subject: Record<string, unknown>,
  holderDID?: string,
  credentialTypes: string[] = ['VerifiableCredential', 'KartuBPJSKesehatan'],
  options?: { credentialId?: string }
): Promise<string> {
  if (!signer || !issuerDID) {
    throw new Error('VC Generator not initialized. Call initVCGenerator() first.')
  }

  const now = Math.floor(Date.now() / 1000)
  const credentialId = normalizeCredentialId(options?.credentialId)

  // Build W3C VC payload for did-jwt-vc
  const vcPayload: any = {
    sub: holderDID || undefined,
    nbf: now,
    jti: credentialId,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: credentialTypes,
      id: credentialId,
      issuer: issuerDID,
      issuanceDate: new Date(now * 1000).toISOString(),
      credentialSubject: subject,
    },
  }

  // Sign the VC as JWT using EdDSA (Ed25519)
  // `kid` in JWT header → verifier resolves did:web → fetches did.json → finds public key
  const signedJwt = await createVerifiableCredentialJwt(
    vcPayload,
    {
      did: issuerDID,
      signer,
      alg: 'EdDSA',
    },
    {
      // Set kid in JWT header so verifiers know which key to use from the DID Document
      header: { kid: issuerKid },
    }
  )

  // Guard against non-compliant JWT VC before returning to controller.
  assertSignedJwtVcIntegrity(signedJwt)

  console.log('✅ Signed JWT VC created')
  console.log('📋 Credential ID:', credentialId)
  console.log('📏 JWT length:', signedJwt.length, 'characters')

  return signedJwt
}
