/**
 * JWT Verifiable Credential Generator
 * 
 * Creates and signs W3C Verifiable Credentials in jwt_vc_json format
 * using Ed25519 (EdDSA) via the did-jwt-vc library.
 */

import { createVerifiableCredentialJwt } from 'did-jwt-vc'
import { EdDSASigner } from 'did-jwt'
import type { CredentialSubject } from '../models/types.js'

// ============================================
// KEY MANAGEMENT
// ============================================

let issuerDID: string = ''
let signer: any = null

/**
 * Initialize the VC generator with the issuer's signing key and DID
 */
export function initVCGenerator(config: {
  privateKeyHex: string
  did: string
}) {
  issuerDID = config.did

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
 * @param subject - The credential subject data (nik, nama, tanggal_lahir)
 * @param holderDID - Optional holder DID for the `sub` claim
 * @returns Signed JWT string
 */
export async function createSignedVC(
  subject: CredentialSubject,
  holderDID?: string
): Promise<string> {
  if (!signer || !issuerDID) {
    throw new Error('VC Generator not initialized. Call initVCGenerator() first.')
  }

  const now = Math.floor(Date.now() / 1000)
  const credentialId = `urn:uuid:${crypto.randomUUID()}`

  // Build W3C VC payload for did-jwt-vc
  const vcPayload: any = {
    sub: holderDID || undefined,
    nbf: now,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'IdentityCredential'],
      id: credentialId,
      issuer: issuerDID,
      issuanceDate: new Date(now * 1000).toISOString(),
      credentialSubject: {
        nik: subject.nik,
        nama: subject.nama,
        tanggal_lahir: subject.tanggal_lahir,
      },
    },
  }

  // Sign the VC as JWT using EdDSA (Ed25519)
  const signedJwt = await createVerifiableCredentialJwt(
    vcPayload,
    {
      did: issuerDID,
      signer,
      alg: 'EdDSA',
    }
  )

  console.log('✅ Signed JWT VC created')
  console.log('📋 Credential ID:', credentialId)
  console.log('📏 JWT length:', signedJwt.length, 'characters')

  return signedJwt
}
