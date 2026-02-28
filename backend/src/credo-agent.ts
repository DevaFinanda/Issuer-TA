/**
 * OpenID4VCI Compliant Issuer Agent
 * 
 * Implements the OpenID for Verifiable Credential Issuance (OID4VCI) protocol
 * following the Credo-TS / OpenWallet Foundation standard.
 * 
 * This implementation provides the same protocol endpoints and credential offer
 * flow as @credo-ts/openid4vc, compatible with any OID4VCI-compliant holder wallet
 * (including Credo-based wallets).
 * 
 * Protocol Flow:
 * 1. Admin fills credential form → POST /api/issue
 * 2. Server creates a credential offer (short URI)
 * 3. QR code contains the credential offer URI
 * 4. Holder scans QR → resolves offer → requests credential via OID4VCI protocol:
 *    a. GET  /oid4vci/.well-known/openid-credential-issuer  (discover metadata)
 *    b. POST /oid4vci/token                                  (exchange pre-auth code for token)
 *    c. POST /oid4vci/credential                             (request credential with token)
 * 5. Server creates SD-JWT VC on-demand → returns to holder
 * 
 * References:
 * - https://github.com/openwallet-foundation/credo-ts
 * - https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 * - https://credo.js.org/guides/tutorials/openid4vc
 * - https://www.w3.org/TR/vc-data-model-2.0/
 */

import { Router, type Router as RouterType } from 'express'
import * as crypto from 'crypto'
import dotenv from 'dotenv'
import { createSigner, getIssuerDID as getLegacyIssuerDID, getPrivateKey } from './agent.js'
import { createSelectiveDisclosureJWT } from './utils/sd-jwt.utils.js'

dotenv.config()

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface CredentialOfferResult {
  credentialOfferUri: string
  issuanceSessionId: string
}

export interface CredentialMetadata {
  holderDID: string
  holderName: string
  noBPJS: string
  nik: string
  tanggalLahir: string
  alamat: string
  documentId: string
  documentHash: string
  documentType: string
  additionalMetadata?: Record<string, any>
}

interface IssuanceSession {
  id: string
  preAuthorizedCode: string
  accessToken?: string
  credentialData: CredentialMetadata
  status: 'created' | 'token_exchanged' | 'credential_issued' | 'expired'
  createdAt: Date
  expiresAt: Date
}

// ============================================
// STATE
// ============================================

/** Express router for OpenID4VCI protocol endpoints */
export const oid4vciRouter: RouterType = Router()

/** Active issuance sessions (pre-authorized code → session data) */
const issuanceSessions = new Map<string, IssuanceSession>()

/** Token → session mapping */
const tokenToSession = new Map<string, string>()

/** Agent initialization flag */
let agentInitialized = false

/** Issuer configuration */
let issuerBaseUrl = ''
let issuerDID = ''

// ============================================
// ISSUER METADATA (OID4VCI Section 10.2)
// ============================================

/**
 * OpenID4VCI Issuer Metadata
 * Describes the issuer's capabilities and supported credentials
 * 
 * This is what the holder wallet reads to understand:
 * - What credentials this issuer can issue
 * - What format they're in (vc+sd-jwt)
 * - What cryptographic methods are used
 */
function getIssuerMetadata() {
  return {
    credential_issuer: `${issuerBaseUrl}/oid4vci`,
    credential_endpoint: `${issuerBaseUrl}/oid4vci/credential`,
    token_endpoint: `${issuerBaseUrl}/oid4vci/token`,
    display: [
      {
        name: process.env.ISSUER_NAME || 'BPJS Kesehatan',
        description: 'Digital Credential Issuer - BPJS Healthcare Archive System',
        locale: 'id-ID',
      },
    ],
    credential_configurations_supported: {
      BPJSHealthCredential: {
        format: 'vc+sd-jwt',
        vct: 'BPJSHealthCredential',
        cryptographic_binding_methods_supported: ['did:key', 'did:web'],
        credential_signing_alg_values_supported: ['EdDSA'],
        display: [
          {
            name: 'BPJS Health Credential',
            description: 'Verifiable credential for BPJS healthcare membership',
            locale: 'id-ID',
            background_color: '#1e40af',
            text_color: '#ffffff',
          },
        ],
        claims: {
          holderName: { display: [{ name: 'Nama Lengkap', locale: 'id-ID' }] },
          noBPJS: { display: [{ name: 'Nomor BPJS', locale: 'id-ID' }] },
          nik: { display: [{ name: 'NIK', locale: 'id-ID' }] },
          tanggalLahir: { display: [{ name: 'Tanggal Lahir', locale: 'id-ID' }] },
          alamat: { display: [{ name: 'Alamat', locale: 'id-ID' }] },
        },
      },
    },
    // Support pre-authorized code flow (no holder login required)
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
  }
}

// ============================================
// OID4VCI PROTOCOL ENDPOINTS
// ============================================

/**
 * Register all OpenID4VCI protocol endpoints on the router
 * These follow the specification exactly as implemented by @credo-ts/openid4vc
 */
function registerOID4VCIEndpoints() {
  // 1. Issuer Metadata Endpoint (RFC Section 10.2)
  //    The holder discovers issuer capabilities via this endpoint
  oid4vciRouter.get('/.well-known/openid-credential-issuer', (req, res) => {
    console.log('📋 Issuer metadata requested by holder wallet')
    res.json(getIssuerMetadata())
  })

  // Also serve at the alternative location
  oid4vciRouter.get('/.well-known/openid-configuration', (req, res) => {
    res.json(getIssuerMetadata())
  })

  // 2. Credential Offer Endpoint
  //    Serves the credential offer JSON when referenced by URI
  oid4vciRouter.get('/offers/:offerId', (req, res) => {
    const { offerId } = req.params
    const session = issuanceSessions.get(offerId)

    if (!session) {
      return res.status(404).json({ error: 'Credential offer not found or expired' })
    }

    if (session.status === 'expired' || session.expiresAt < new Date()) {
      session.status = 'expired'
      return res.status(410).json({ error: 'Credential offer has expired' })
    }

    console.log('📥 Credential offer resolved by holder:', offerId)

    // Return the credential offer in OID4VCI format
    res.json({
      credential_issuer: `${issuerBaseUrl}/oid4vci`,
      credential_configuration_ids: ['BPJSHealthCredential'],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': session.preAuthorizedCode,
        },
      },
    })
  })

  // 3. Token Endpoint (OID4VCI Section 6)
  //    The holder exchanges the pre-authorized code for an access token
  oid4vciRouter.post('/token', (req, res) => {
    const { grant_type, 'pre-authorized_code': preAuthCode } = req.body

    console.log('🔐 Token request received')

    // Validate grant type
    if (grant_type !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only pre-authorized_code grant type is supported',
      })
    }

    if (!preAuthCode) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'pre-authorized_code is required',
      })
    }

    // Find the session by pre-authorized code
    let targetSession: IssuanceSession | null = null
    for (const [, session] of issuanceSessions) {
      if (session.preAuthorizedCode === preAuthCode) {
        targetSession = session
        break
      }
    }

    if (!targetSession) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired pre-authorized code',
      })
    }

    if (targetSession.expiresAt < new Date()) {
      targetSession.status = 'expired'
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Pre-authorized code has expired',
      })
    }

    // Generate access token
    const accessToken = crypto.randomBytes(32).toString('base64url')
    targetSession.accessToken = accessToken
    targetSession.status = 'token_exchanged'
    tokenToSession.set(accessToken, targetSession.id)

    console.log('✅ Token issued for session:', targetSession.id)

    // Return token response per RFC 6749
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
      c_nonce: crypto.randomBytes(16).toString('base64url'),
      c_nonce_expires_in: 3600,
    })
  })

  // 4. Credential Endpoint (OID4VCI Section 7)
  //    The holder requests the actual credential using the access token
  oid4vciRouter.post('/credential', async (req, res) => {
    console.log('📜 Credential request received')

    // Validate Bearer token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing or invalid Bearer token',
      })
    }

    const accessToken = authHeader.substring(7)
    const sessionId = tokenToSession.get(accessToken)

    if (!sessionId) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Token not recognized',
      })
    }

    const session = issuanceSessions.get(sessionId)
    if (!session || session.accessToken !== accessToken) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid session',
      })
    }

    // Validate credential request format
    const { format, vct, proof } = req.body
    if (format !== 'vc+sd-jwt') {
      return res.status(400).json({
        error: 'unsupported_credential_format',
        error_description: 'Only vc+sd-jwt format is supported',
      })
    }

    try {
      // ============================================
      // CREATE THE SD-JWT VERIFIABLE CREDENTIAL
      // This is the equivalent of Credo's credentialRequestToCredentialMapper
      // ============================================
      const metadata = session.credentialData
      const privateKeyHex = getPrivateKey()

      const vcPayload = {
        sub: metadata.holderDID,
        vc: {
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://www.w3.org/2018/credentials/examples/v1',
          ],
          type: ['VerifiableCredential', 'BPJSHealthCredential'],
          credentialSubject: {
            id: metadata.holderDID,
            type: 'BPJSMember',
            holderName: metadata.holderName,
            noBPJS: metadata.noBPJS,
            nik: metadata.nik,
            tanggalLahir: metadata.tanggalLahir,
            alamat: metadata.alamat,
            document: {
              documentId: metadata.documentId,
              documentHash: metadata.documentHash,
              documentType: metadata.documentType,
            },
            metadata: metadata.additionalMetadata || {},
          },
        },
      }

      console.log('🔐 Creating SD-JWT VC with selective disclosure...')

      const { sdJwt, disclosures, prettyClaims } = await createSelectiveDisclosureJWT(
        vcPayload,
        privateKeyHex,
        issuerDID
      )

      // Mark session as completed
      session.status = 'credential_issued'

      // Clean up token mapping
      tokenToSession.delete(accessToken)

      console.log('✅ Credential issued to holder via OID4VCI protocol')
      console.log('📦 SD-JWT size:', sdJwt.length, 'characters')
      console.log('🔒 Selective disclosure fields:', Object.keys(prettyClaims))

      // Return credential response per OID4VCI Section 7.3
      res.json({
        format: 'vc+sd-jwt',
        credential: sdJwt,
        c_nonce: crypto.randomBytes(16).toString('base64url'),
        c_nonce_expires_in: 3600,
      })
    } catch (error: any) {
      console.error('❌ Error creating credential:', error)
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to create credential',
      })
    }
  })

  console.log('📋 OpenID4VCI protocol endpoints registered')
}

// ============================================
// AGENT INITIALIZATION
// ============================================

/**
 * Initialize the OID4VCI issuer agent.
 * 
 * Sets up:
 * 1. The issuer DID (did:web) for credential signing
 * 2. OpenID4VCI protocol endpoints on the Express router
 * 3. Credential offer management
 * 
 * The endpoints serve the same protocol as @credo-ts/openid4vc OpenId4VcIssuerModule,
 * making this compatible with any OID4VCI-compliant holder wallet.
 */
export async function initializeCredoAgent(): Promise<void> {
  const port = Number(process.env.PORT) || 3000
  const domain = process.env.ISSUER_DOMAIN || process.env.DID_WEB_DOMAIN || `localhost:${port}`
  const protocol = domain.includes('localhost') ? 'http' : 'http'
  issuerBaseUrl = process.env.ISSUER_BASE_URL || `${protocol}://${domain}`
  issuerDID = getLegacyIssuerDID()

  console.log('\n🚀 Initializing OpenID4VCI Issuer Agent...')
  console.log(`📍 Issuer Base URL: ${issuerBaseUrl}`)
  console.log(`🔑 Issuer DID: ${issuerDID}`)

  // Register OID4VCI protocol endpoints
  registerOID4VCIEndpoints()

  // Start periodic cleanup of expired sessions
  setInterval(cleanupExpiredSessions, 5 * 60 * 1000) // Every 5 minutes

  agentInitialized = true

  console.log('\n✅ OpenID4VCI Issuer Agent fully configured')
  console.log('📋 Protocol: OpenID for Verifiable Credential Issuance (OID4VCI)')
  console.log('📦 Credential format: vc+sd-jwt (SD-JWT Verifiable Credential)')
  console.log('🔑 Signing algorithm: EdDSA (Ed25519)')
  console.log('🔐 Flow: Pre-Authorized Code Flow\n')
  console.log('📋 Endpoints:')
  console.log(`   GET  ${issuerBaseUrl}/oid4vci/.well-known/openid-credential-issuer`)
  console.log(`   GET  ${issuerBaseUrl}/oid4vci/offers/:id`)
  console.log(`   POST ${issuerBaseUrl}/oid4vci/token`)
  console.log(`   POST ${issuerBaseUrl}/oid4vci/credential\n`)
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get the issuer's DID
 */
export function getIssuerDID(): string {
  return issuerDID || getLegacyIssuerDID()
}

/**
 * Check if the agent is initialized and ready
 */
export function isAgentReady(): boolean {
  return agentInitialized
}

/**
 * Create a credential offer for the OpenID4VCI protocol.
 * 
 * This generates a credential offer URI that can be encoded in a QR code.
 * The offer URI is SHORT (~100-300 chars) compared to the raw SD-JWT (~2KB+).
 * 
 * When a holder scans the QR code, they initiate the OID4VCI flow:
 * 1. Resolve the credential offer (GET /oid4vci/offers/:id)
 * 2. Discover issuer metadata (GET /oid4vci/.well-known/openid-credential-issuer)
 * 3. Exchange pre-authorized code for token (POST /oid4vci/token)
 * 4. Request the credential (POST /oid4vci/credential)
 * 5. Receive the signed SD-JWT VC
 * 
 * @param credentialData - The credential subject data from the admin form
 * @returns The credential offer URI and issuance session ID
 */
export async function createCredentialOffer(
  credentialData: CredentialMetadata
): Promise<CredentialOfferResult> {
  if (!agentInitialized) {
    throw new Error('Agent not initialized. Call initializeCredoAgent() first.')
  }

  // Generate unique IDs
  const sessionId = crypto.randomUUID()
  const preAuthorizedCode = crypto.randomBytes(32).toString('base64url')

  // Create issuance session (valid for 10 minutes)
  const session: IssuanceSession = {
    id: sessionId,
    preAuthorizedCode,
    credentialData,
    status: 'created',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  }

  issuanceSessions.set(sessionId, session)

  console.log('📋 Credential offer created')
  console.log('📝 Session ID:', sessionId)
  console.log('👤 Holder:', credentialData.holderName)

  // Build the credential offer URI per OID4VCI specification
  // Format: openid-credential-offer://?credential_offer_uri=<url>
  // This is the SHORT URI that goes into the QR code
  const offerUrl = `${issuerBaseUrl}/oid4vci/offers/${sessionId}`
  const credentialOfferUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offerUrl)}`

  console.log('🔗 Offer URI length:', credentialOfferUri.length, 'characters')
  console.log('📊 Compare: SD-JWT would be ~2000+ characters')

  return {
    credentialOfferUri,
    issuanceSessionId: sessionId,
  }
}

/**
 * Gracefully shutdown the agent
 */
export async function shutdownAgent(): Promise<void> {
  agentInitialized = false
  issuanceSessions.clear()
  tokenToSession.clear()
  console.log('🔒 OID4VCI Agent shut down')
}

/**
 * Clean up expired issuance sessions
 */
function cleanupExpiredSessions(): void {
  const now = new Date()
  let cleaned = 0

  for (const [id, session] of issuanceSessions) {
    if (session.expiresAt < now) {
      issuanceSessions.delete(id)
      cleaned++
    }
  }

  // Clean up orphaned token mappings
  for (const [token, sessionId] of tokenToSession) {
    if (!issuanceSessions.has(sessionId)) {
      tokenToSession.delete(token)
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired issuance sessions`)
  }
}

/**
 * Get active session count (for monitoring)
 */
export function getActiveSessionCount(): number {
  return issuanceSessions.size
}
