import * as crypto from 'crypto'
import { createSigner } from '../agent.js'
import { createVerifiableCredentialJwt } from 'did-jwt-vc'

/**
 * SD-JWT Utilities for Selective Disclosure
 * Implements W3C VC Data Model + SD-JWT Draft Specification
 * https://www.w3.org/TR/vc-data-model-2.0/
 * https://datatracker.ietf.org/doc/html/draft-ietf-oauth-selective-disclosure-jwt
 */

interface DisclosureItem {
  salt: string
  claim: string
  value: any
}

/**
 * Create hash of disclosure for SD-JWT (SHA-256 as per spec)
 */
function hashDisclosure(disclosure: DisclosureItem): string {
  const disclosureArray = [disclosure.salt, disclosure.claim, disclosure.value]
  const disclosureString = JSON.stringify(disclosureArray)
  const encoded = Buffer.from(disclosureString).toString('base64url')
  
  // Hash the encoded disclosure with SHA-256 (required by SD-JWT spec)
  return crypto.createHash('sha256').update(encoded).digest('base64url')
}

/**
 * Create SD-JWT with selective disclosure for sensitive fields (COMPACT VERSION)
 */
export async function createSelectiveDisclosureJWT(
  payload: any,
  privateKeyHex: string,
  issuerDID: string
): Promise<{
  sdJwt: string
  disclosures: string[]
  prettyClaims: any
}> {
  try {
    // Define which fields should be selectively disclosable
    const selectiveFields = [
      'holderName',
      'noBPJS', 
      'nik',
      'tanggalLahir',
      'alamat'
    ]

    const credentialSubject = payload.vc.credentialSubject
    
    // Create disclosures and hashes for selective fields
    const disclosures: DisclosureItem[] = []
    const sdHashes: string[] = []
    const prettyClaims: any = {}

    for (const field of selectiveFields) {
      if (credentialSubject[field]) {
        const salt = crypto.randomBytes(8).toString('base64url') // Reduced from 16 to 8 bytes
        const disclosure: DisclosureItem = {
          salt,
          claim: field,
          value: credentialSubject[field]
        }
        
        disclosures.push(disclosure)
        sdHashes.push(hashDisclosure(disclosure))
        prettyClaims[field] = credentialSubject[field]
      }
    }

    // Create W3C Verifiable Credential with SD-JWT
    // Compliant with W3C VC Data Model 2.0 + SD-JWT Draft Spec
    const now = Math.floor(Date.now() / 1000)
    const sdPayload = {
      sub: payload.sub,
      iss: issuerDID,
      iat: now,
      nbf: now,
      exp: now + (365 * 24 * 60 * 60), // 1 year
      jti: `urn:uuid:${crypto.randomUUID()}`,
      vc: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        type: ['VerifiableCredential', 'BPJSHealthCredential'],
        issuer: {
          id: issuerDID,
          name: 'BPJS Kesehatan'
        },
        issuanceDate: new Date(now * 1000).toISOString(),
        expirationDate: new Date((now + 365 * 24 * 60 * 60) * 1000).toISOString(),
        credentialSubject: {
          id: credentialSubject.id,
          type: credentialSubject.type || 'BPJSMember',
          document: credentialSubject.document,
          metadata: credentialSubject.metadata,
          _sd: sdHashes,
        },
      },
      _sd_alg: 'sha-256', // Hash algorithm for SD-JWT (required)
    }

    // Sign the SD-JWT payload with EdDSA (Ed25519)
    // This creates a JWT with alg: "EdDSA" in the header
    const signer = createSigner(privateKeyHex)
    const sdJwtToken = await createVerifiableCredentialJwt(sdPayload, {
      did: issuerDID,
      signer,
      alg: 'EdDSA', // Explicitly set EdDSA algorithm
      // JWT Header will contain: { "alg": "EdDSA", "typ": "JWT" }
    })

    // Encode disclosures as per SD-JWT spec
    // Format: Base64url(JSON([salt, claim, value]))
    const encodedDisclosures = disclosures.map(d => {
      const array = [d.salt, d.claim, d.value]
      return Buffer.from(JSON.stringify(array)).toString('base64url')
    })

    // Format SD-JWT as per spec: jwt~disclosure1~disclosure2~...~
    // The trailing ~ is for optional key binding JWT
    const sdJwt = [sdJwtToken, ...encodedDisclosures, ''].join('~')

    return {
      sdJwt,
      disclosures: disclosures.map(d => JSON.stringify([d.salt, d.claim, d.value])),
      prettyClaims
    }

  } catch (error: any) {
    console.error('❌ SD-JWT creation error:', error)
    throw new Error(`Failed to create SD-JWT: ${error.message}`)
  }
}

/**
 * Parse SD-JWT to extract components
 */
export function parseSDJWT(sdJwt: string): {
  jwt: string
  disclosures: string[]
  keybindingJwt?: string
} {
  const parts = sdJwt.split('~')
  
  return {
    jwt: parts[0],
    disclosures: parts.slice(1, -1).filter(p => p.length > 0),
    keybindingJwt: parts[parts.length - 1] || undefined
  }
}

/**
 * Decode disclosure to readable format
 */
export function decodeDisclosure(disclosure: string): {
  salt: string
  claim: string
  value: any
} {
  try {
    const decoded = Buffer.from(disclosure, 'base64url').toString('utf8')
    const [salt, claim, value] = JSON.parse(decoded)
    
    return { salt, claim, value }
  } catch (error) {
    throw new Error('Invalid disclosure format')
  }
}
