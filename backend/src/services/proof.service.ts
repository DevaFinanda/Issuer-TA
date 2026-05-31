import crypto from 'crypto'
import { verifyJWT, type JWTVerified } from 'did-jwt'
import { Resolver } from 'did-resolver'
import { getResolver as getWebDidResolver } from 'web-did-resolver'
import { getResolver as getKeyDidResolver } from 'key-did-resolver'
import { areEquivalentDid, normalizeDidForStorage } from '../lib/did.js'
import { BASE_URL } from '../lib/issuer-url.js'

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

const jwkResolver = {
  jwk: async (did: string) => {
    try {
      const methodSpecificId = did.slice('did:jwk:'.length)
      const jwkJson = decodeBase64Url(methodSpecificId)
      const jwk = JSON.parse(jwkJson) as Record<string, unknown>

      const vmId = `${did}#0`
      return {
        didDocumentMetadata: {},
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
        didDocument: {
          id: did,
          verificationMethod: [
            {
              id: vmId,
              type: 'JsonWebKey2020',
              controller: did,
              publicKeyJwk: jwk as any,
            },
          ],
          authentication: [vmId],
          assertionMethod: [vmId],
        },
      }
    } catch {
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'invalidDid',
          message: 'Unable to resolve DID document for did:jwk',
        },
      }
    }
  },
}

const didResolver = new Resolver({
  ...getWebDidResolver(),
  ...getKeyDidResolver(),
  ...jwkResolver,
} as any) as any

const ISSUER_IDENTIFIER = BASE_URL
const ALLOWED_AUDIENCES = [
  ISSUER_IDENTIFIER,
  `${ISSUER_IDENTIFIER}/oid4vci/credential`,
]

function safeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function decodeJwtPart<T = Record<string, unknown>>(part: string, partName: 'header' | 'payload'): T {
  try {
    const json = decodeBase64Url(part)
    return JSON.parse(json) as T
  } catch {
    throw new ProofVerificationError(`Malformed proof JWT ${partName}`, 400)
  }
}

function toAudienceList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? [normalized] : []
  }

  return []
}

function logProofContext(label: string, payload: Record<string, unknown>) {
  console.log(`[proof-debug] ${label}:`, JSON.stringify(payload, null, 2))
}

function validateAudienceOrThrow(receivedAudience: string[]): {
  expectedIssuerIdentifier: string
  allowedAudiences: string[]
  receivedAudience: string[]
  matchedAudience: string
  debugFallbackUsed: boolean
} {
  const expectedIssuerIdentifier = ISSUER_IDENTIFIER
  const allowedAudiences = [...ALLOWED_AUDIENCES]
  const audienceValues = Array.from(new Set(receivedAudience.map((value) => String(value || '').trim()).filter(Boolean)))

  if (audienceValues.length === 0) {
    logProofContext('failure-point', {
      step: 'audience-missing',
      expectedIssuerIdentifier,
      allowedAudiences,
      receivedAudience: audienceValues,
    })
    throw new ProofVerificationError(
      'invalid_proof: missing audience (aud) in proof JWT',
      401
    )
  }

  const isAudienceValid = audienceValues.some((audience) => allowedAudiences.includes(audience))
  if (isAudienceValid) {
    const matchedAudience = audienceValues.find((audience) => allowedAudiences.includes(audience)) || expectedIssuerIdentifier
    return {
      expectedIssuerIdentifier,
      allowedAudiences,
      receivedAudience: audienceValues,
      matchedAudience,
      debugFallbackUsed: false,
    }
  }

  const hasIssuerHostButUnregistered = audienceValues.some((audience) => audience.startsWith(`${ISSUER_IDENTIFIER}/`))
  const reason = hasIssuerHostButUnregistered ? 'audience-unregistered' : 'audience-mismatch'

  logProofContext('failure-point', {
    step: reason,
    expectedIssuerIdentifier,
    allowedAudiences,
    receivedAudience: audienceValues,
    debugFallbackEnabled: false,
  })

  throw new ProofVerificationError(
    hasIssuerHostButUnregistered
      ? `invalid_proof: unregistered audience (${audienceValues.join(', ')})`
      : `invalid_proof: audience mismatch (received: ${audienceValues.join(', ')})`,
    401
  )
}

async function resolveVerificationMethod(input: {
  holderDid: string
  kid?: string
}): Promise<{
  didForVerification: string
  selectedVerificationMethod: Record<string, unknown>
  publicKeyJwk: Record<string, unknown>
}> {
  const didResolution = await (didResolver as any).resolve(input.holderDid)
  const didDocument = didResolution?.didDocument as Record<string, unknown> | null | undefined

  logProofContext('did-resolution', {
    did: input.holderDid,
    kid: input.kid || null,
    didResolutionMetadata: didResolution?.didResolutionMetadata || null,
    didDocumentId: didDocument?.id || null,
  })

  if (!didDocument) {
    throw new ProofVerificationError('DID resolution failed: didDocument is missing', 401)
  }

  const verificationMethods = Array.isArray(didDocument.verificationMethod)
    ? (didDocument.verificationMethod as Array<Record<string, unknown>>)
    : []

  if (verificationMethods.length === 0) {
    throw new ProofVerificationError('DID resolution failed: verificationMethod is empty', 401)
  }

  const normalizedKid = safeString(input.kid)
  const selected = normalizedKid
    ? verificationMethods.find((vm) => {
      const vmId = String(vm.id || '')
      return vmId === normalizedKid || (normalizedKid.startsWith('#') && vmId.endsWith(normalizedKid))
    })
    : verificationMethods[0]

  if (!selected) {
    throw new ProofVerificationError('DID resolution failed: kid does not match any verificationMethod', 401)
  }

  const jwk = selected.publicKeyJwk as Record<string, unknown> | undefined
  if (!jwk) {
    throw new ProofVerificationError('DID resolution failed: selected verificationMethod has no publicKeyJwk', 401)
  }

  logProofContext('verification-material', {
    did: input.holderDid,
    selectedVerificationMethodId: selected.id || null,
    selectedVerificationMethodType: selected.type || null,
    extractedPublicKey: {
      kty: jwk.kty || null,
      crv: jwk.crv || null,
      x: jwk.x || null,
      y: jwk.y || null,
      kid: jwk.kid || null,
    },
  })

  if (String(jwk.kty || '').toUpperCase() !== 'OKP' || String(jwk.crv || '') !== 'Ed25519') {
    throw new ProofVerificationError('Unsupported key format for proof JWT: expected OKP/Ed25519', 401)
  }

  return {
    didForVerification: input.holderDid,
    selectedVerificationMethod: selected,
    publicKeyJwk: jwk,
  }
}

function verifyJwtSignatureManually(input: {
  token: string
  publicKeyJwk: Record<string, unknown>
  did: string
  kid?: string
}): void {
  const parts = input.token.split('.')
  if (parts.length !== 3) {
    throw new ProofVerificationError('Malformed proof JWT: expected three segments', 400)
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts

  let signature: Buffer
  try {
    const normalized = encodedSignature.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    signature = Buffer.from(padded, 'base64')
  } catch {
    throw new ProofVerificationError('Proof JWT signature encoding is invalid', 401)
  }

  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8')

  let publicKey: crypto.KeyObject
  try {
    publicKey = crypto.createPublicKey({
      key: input.publicKeyJwk as any,
      format: 'jwk',
    })
  } catch (error: any) {
    throw new ProofVerificationError(`Unable to construct public key from DID document: ${error.message || 'unknown error'}`, 401)
  }

  const valid = crypto.verify(null, signingInput, publicKey, signature)
  logProofContext('manual-signature-verification', {
    did: input.did,
    kid: input.kid || null,
    signatureByteLength: signature.length,
    result: valid ? 'valid' : 'invalid',
  })

  if (!valid) {
    throw new ProofVerificationError('Manual signature verification failed (wrong key, malformed signature, or encoding issue)', 401)
  }
}

export class ProofVerificationError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 400) {
    super(message)
    this.name = 'ProofVerificationError'
    this.statusCode = statusCode
  }
}

export async function verifyHolderProofJwt(input: {
  proofJwt: string
  expectedNonce: string
  expectedDid?: string
  expectedDids?: string[]
}): Promise<{
  holderDid: string
  proofPayload: JWTVerified['payload']
}> {
  const expectedAudience = ISSUER_IDENTIFIER

  const tokenParts = String(input.proofJwt || '').split('.')
  if (tokenParts.length !== 3) {
    throw new ProofVerificationError('Malformed proof JWT: expected JWS compact serialization', 400)
  }

  const decodedHeader = decodeJwtPart<Record<string, unknown>>(tokenParts[0], 'header')
  const decodedPayload = decodeJwtPart<Record<string, unknown>>(tokenParts[1], 'payload')

  const receivedAudience = toAudienceList(decodedPayload.aud)
  const audienceValidation = validateAudienceOrThrow(receivedAudience)
  const rawHolderDid =
    safeString(decodedPayload.iss) ||
    safeString(decodedPayload.sub) ||
    ''
  const holderDid = normalizeDidForStorage(rawHolderDid)

  logProofContext('validation-context', {
    expectedAudience,
    expectedIssuerIdentifier: audienceValidation.expectedIssuerIdentifier,
    allowedAudiences: audienceValidation.allowedAudiences,
    receivedAudience,
    debugFallbackUsed: audienceValidation.debugFallbackUsed,
    expectedNonce: input.expectedNonce,
    receivedNonce: safeString(decodedPayload.nonce) || null,
    expectedDids: [
      ...(Array.isArray(input.expectedDids) ? input.expectedDids : []),
      ...(input.expectedDid ? [input.expectedDid] : []),
    ],
    decodedHeader,
    decodedPayload,
    extractedHolderDid: holderDid || null,
  })

  const algorithm = safeString(decodedHeader.alg)
  if (algorithm !== 'EdDSA') {
    throw new ProofVerificationError('Unsupported proof JWT alg. Expected EdDSA', 401)
  }

  const tokenType = safeString(decodedHeader.typ)
  if (tokenType && tokenType !== 'JWT' && tokenType !== 'openid4vci-proof+jwt') {
    throw new ProofVerificationError('Unsupported proof JWT typ. Expected JWT or openid4vci-proof+jwt', 401)
  }

  if (!holderDid) {
    throw new ProofVerificationError('Proof JWT must contain holder DID in iss or sub', 400)
  }

  const resolvedVerification = await resolveVerificationMethod({
    holderDid,
    kid: safeString(decodedHeader.kid),
  })

  verifyJwtSignatureManually({
    token: input.proofJwt,
    publicKeyJwk: resolvedVerification.publicKeyJwk,
    did: resolvedVerification.didForVerification,
    kid: safeString(decodedHeader.kid),
  })

  let verified: JWTVerified
  try {
    verified = await verifyJWT(input.proofJwt, {
      resolver: didResolver,
      audience: audienceValidation.matchedAudience,
    })
  } catch (error: any) {
    logProofContext('failure-point', {
      step: 'signature/did-jwt-verification',
      reason: error.message || 'verification failed',
      did: holderDid,
      kid: safeString(decodedHeader.kid) || null,
    })
    throw new ProofVerificationError(`Invalid proof JWT signature: ${error.message || 'verification failed'}`, 401)
  }

  const verifiedAudience = toAudienceList((verified.payload as Record<string, unknown>).aud)
  const verifiedAudienceValidation = validateAudienceOrThrow(verifiedAudience)

  const allowedDidCandidates = [
    ...(Array.isArray(input.expectedDids) ? input.expectedDids : []),
    ...(input.expectedDid ? [input.expectedDid] : []),
  ]
  const allowedDids = Array.from(
    new Set(
      allowedDidCandidates
        .map((did) => normalizeDidForStorage(did))
        .filter(Boolean)
    )
  )

  if (allowedDids.length > 0) {
    const didMatches = allowedDids.some((allowedDid) => areEquivalentDid(holderDid, allowedDid))
    if (!didMatches) {
      logProofContext('failure-point', {
        step: 'did-matching',
        expectedDids: allowedDids,
        actualDid: holderDid,
      })
      throw new ProofVerificationError('Proof DID does not match token-bound holder DID', 401)
    }
  }

  const nonce = safeString((verified.payload as Record<string, unknown>).nonce)
  if (!nonce) {
    logProofContext('failure-point', {
      step: 'nonce-missing',
      expectedNonce: input.expectedNonce,
      receivedNonce: null,
    })
    throw new ProofVerificationError('Proof JWT nonce is missing', 400)
  }

  if (nonce !== input.expectedNonce) {
    logProofContext('failure-point', {
      step: 'nonce-mismatch',
      expectedNonce: input.expectedNonce,
      receivedNonce: nonce,
    })
    throw new ProofVerificationError('Proof JWT nonce mismatch', 401)
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof verified.payload.exp === 'number' && verified.payload.exp < now) {
    logProofContext('failure-point', {
      step: 'token-expired',
      exp: verified.payload.exp,
      now,
    })
    throw new ProofVerificationError('Proof JWT has expired', 401)
  }

  if (typeof verified.payload.nbf === 'number' && verified.payload.nbf > now + 30) {
    logProofContext('failure-point', {
      step: 'token-not-yet-valid',
      nbf: verified.payload.nbf,
      now,
    })
    throw new ProofVerificationError('Proof JWT not yet valid', 401)
  }

  logProofContext('verification-success', {
    step: 'complete',
    holderDid,
    expectedNonce: input.expectedNonce,
    receivedNonce: nonce,
    expectedAudience,
    receivedAudience: verifiedAudience,
    allowedAudiences: verifiedAudienceValidation.allowedAudiences,
    debugFallbackUsed: verifiedAudienceValidation.debugFallbackUsed,
  })

  return {
    holderDid,
    proofPayload: verified.payload,
  }
}

export async function verifyPresentedCredentialJwt(credentialJwt: string): Promise<JWTVerified['payload']> {
  try {
    const verified = await verifyJWT(credentialJwt, {
      resolver: didResolver,
    })

    const vc = (verified.payload as Record<string, unknown>).vc
    if (!vc || typeof vc !== 'object') {
      throw new ProofVerificationError('Presented VC payload is missing vc object', 400)
    }

    return verified.payload
  } catch (error: any) {
    if (error instanceof ProofVerificationError) {
      throw error
    }

    throw new ProofVerificationError(`Presented VC signature verification failed: ${error.message || 'unknown error'}`, 401)
  }
}
