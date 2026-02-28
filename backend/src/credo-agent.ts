/**
 * OpenID4VCI Issuer Agent — Built with Credo-TS (OpenWallet Foundation)
 *
 * Uses the official @credo-ts/openid4vc library for standards-compliant
 * OpenID for Verifiable Credential Issuance (OID4VCI) protocol.
 *
 * Key components:
 *   - @credo-ts/core       — Credo Agent, DID management, key management
 *   - @credo-ts/askar      — Aries Askar secure key store
 *   - @credo-ts/openid4vc  — OpenID4VCI issuer module (endpoints + protocol)
 *   - @credo-ts/node       — Node.js platform bindings
 *
 * Protocol Flow (Pre-Authorized Code):
 *   1. Admin fills form → POST /api/issue → createCredentialOffer()
 *   2. Credo creates credential offer URI  (short, ~150 chars)
 *   3. QR code encodes the offer URI
 *   4. Holder wallet scans QR and resolves the OID4VCI flow:
 *      a. Discover issuer metadata
 *      b. Exchange pre-authorized code → access token
 *      c. Request credential with access token
 *   5. Credo calls credentialRequestToCredentialMapper → SD-JWT VC returned
 *
 * References:
 *   - https://github.com/openwallet-foundation/credo-ts
 *   - https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 *   - https://credo.js.org/guides/tutorials/openid4vc
 */

import type { Express } from 'express'
import type { DidKey } from '@credo-ts/core'
import {
  Agent,
  ConsoleLogger,
  LogLevel,
  DidKey as DidKeyClass,
  Kms,
  Buffer as CredoBuffer,
  ClaimFormat,
} from '@credo-ts/core'
import {
  agentDependencies,
  NodeKeyManagementService,
  NodeInMemoryKeyManagementStorage,
} from '@credo-ts/node'
import { AskarModule, transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import {
  OpenId4VcModule,
  type OpenId4VcIssuerRecord,
  OpenId4VciCredentialFormatProfile,
  type OpenId4VciCredentialConfigurationsSupportedWithFormats,
  type OpenId4VciCredentialRequestToCredentialMapper,
  type OpenId4VciSignSdJwtCredentials,
  type OpenId4VcIssuerModuleConfigOptions,
} from '@credo-ts/openid4vc'
import { askar } from '@openwallet-foundation/askar-nodejs'
import dotenv from 'dotenv'

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

// ============================================
// MODULE-LEVEL STATE
// ============================================

/** The Credo Agent instance */
let agent: Agent<{
  askar: AskarModule
  kms: Kms.KeyManagementModule
  openid4vc: OpenId4VcModule<OpenId4VcIssuerModuleConfigOptions>
}>

/** Issuer record created by Credo (contains issuerId, credential configs) */
let issuerRecord: OpenId4VcIssuerRecord

/** DID Key for credential signing */
let agentDidKey: DidKey

/** Agent initialization flag */
let agentInitialized = false

/** Issuer base URL */
let issuerBaseUrl = ''

/**
 * Pending credential data keyed by issuance session ID.
 * When an admin creates a credential offer, the BPJS data is stored here.
 * When the holder requests the credential, the mapper looks up the data by session ID.
 */
const pendingCredentials = new Map<string, CredentialMetadata>()

// ============================================
// CREDENTIAL CONFIGURATION (OID4VCI)
// ============================================

/**
 * Defines the credential types this issuer can issue.
 * Follows OpenID4VCI Section 10.2.3 — credential_configurations_supported
 */
const credentialConfigurationsSupported = {
  BPJSHealthCredential: {
    format: OpenId4VciCredentialFormatProfile.SdJwtVc,
    vct: 'BPJSHealthCredential',
    cryptographic_binding_methods_supported: ['did:key', 'did:web', 'jwk'],
    credential_signing_alg_values_supported: [
      Kms.KnownJwaSignatureAlgorithms.EdDSA,
    ],
    proof_types_supported: {
      jwt: {
        proof_signing_alg_values_supported: [
          Kms.KnownJwaSignatureAlgorithms.EdDSA,
          Kms.KnownJwaSignatureAlgorithms.ES256,
        ],
      },
    },
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
} satisfies OpenId4VciCredentialConfigurationsSupportedWithFormats

// ============================================
// CREDENTIAL REQUEST → CREDENTIAL MAPPER
// ============================================

/**
 * Called by Credo when a holder requests a credential via the OID4VCI protocol.
 *
 * This is the equivalent of Credo demo's getCredentialRequestToCredentialMapper().
 * It looks up the BPJS data from pendingCredentials and returns the SD-JWT payload.
 */
function getCredentialMapper(): OpenId4VciCredentialRequestToCredentialMapper {
  return async ({
    holderBinding,
    credentialConfigurationId,
    credentialConfiguration,
    issuanceSession,
  }) => {
    console.log('📜 Credo: Credential request received for session:', issuanceSession.id)
    console.log('📋 Credential config:', credentialConfigurationId)

    // Look up the BPJS credential data stored when the offer was created
    const credentialData = pendingCredentials.get(issuanceSession.id)
    if (!credentialData) {
      throw new Error(
        `No credential data found for session ${issuanceSession.id}. ` +
        `The offer may have expired or already been claimed.`
      )
    }

    console.log('🔐 Creating SD-JWT VC for:', credentialData.holderName)

    // Build the SD-JWT VC credential payload
    // Credo handles the signing, SD-JWT packaging, and response
    const result = {
      type: 'credentials' as const,
      format: ClaimFormat.SdJwtDc,
      credentials: holderBinding.keys.map((binding) => ({
        payload: {
          vct: 'BPJSHealthCredential',
          // BPJS healthcare credential claims
          holderName: credentialData.holderName,
          noBPJS: credentialData.noBPJS,
          nik: credentialData.nik,
          tanggalLahir: credentialData.tanggalLahir,
          alamat: credentialData.alamat,
          // Document metadata (always visible)
          document: {
            documentId: credentialData.documentId,
            documentHash: credentialData.documentHash,
            documentType: credentialData.documentType,
          },
          ...(credentialData.additionalMetadata
            ? { metadata: credentialData.additionalMetadata }
            : {}),
        },
        holder: binding,
        issuer: {
          method: 'did' as const,
          didUrl: `${agentDidKey.did}#${agentDidKey.publicJwk.fingerprint}`,
        },
        // Selective disclosure: these claims can be revealed individually
        disclosureFrame: {
          _sd: ['holderName', 'noBPJS', 'nik', 'tanggalLahir', 'alamat'],
        },
      })),
    } satisfies OpenId4VciSignSdJwtCredentials

    // Mark credential as claimed — clean up pending data
    pendingCredentials.delete(issuanceSession.id)
    console.log('✅ Credo: SD-JWT VC created and returned to holder')

    return result
  }
}

// ============================================
// AGENT MODULES FACTORY
// ============================================

/**
 * Creates the Credo module configuration for the Agent.
 * Follows the same pattern as the Credo-TS demo (BaseAgent + Issuer).
 */
function getAgentModules(app: Express) {
  return {
    // Aries Askar — secure key store and wallet
    askar: new AskarModule({
      askar,
      store: {
        id: 'issuer-bpjs',
        key: 'issuer-bpjs-credential-store',
      },
    }),
    // Key Management Service — Node.js backend
    kms: new Kms.KeyManagementModule({
      backends: [
        new NodeKeyManagementService(new NodeInMemoryKeyManagementStorage()),
      ],
    }),
    // OpenID4VCI — registers protocol endpoints on Express app
    // Uses the combined OpenId4VcModule (same as Credo demo)
    openid4vc: new OpenId4VcModule({
      // Cast needed: @credo-ts/openid4vc uses express-serve-static-core@5.x types
      app: app as any,
      issuer: {
        baseUrl: `${issuerBaseUrl}/oid4vci`,
        credentialRequestToCredentialMapper: getCredentialMapper(),
      },
    }),
  }
}

// ============================================
// AGENT INITIALIZATION
// ============================================

/**
 * Initialize the Credo-TS Agent with OpenID4VCI capability.
 *
 * This sets up:
 * 1. Aries Askar for secure key storage
 * 2. DID:key for credential signing (EdDSA / Ed25519)
 * 3. OpenID4VCI issuer endpoints on the Express app
 *
 * @param app — The Express application to mount OID4VCI endpoints on
 */
export async function initializeCredoAgent(app: Express): Promise<void> {
  const port = Number(process.env.PORT) || 3001
  const domain =
    process.env.ISSUER_DOMAIN || process.env.DID_WEB_DOMAIN || `localhost:${port}`
  issuerBaseUrl = process.env.ISSUER_BASE_URL || `http://${domain}`

  console.log('\n🚀 Initializing Credo-TS Agent (OpenWallet Foundation)...')
  console.log(`📍 Issuer Base URL: ${issuerBaseUrl}`)

  // Create and initialize the Credo Agent
  agent = new Agent({
    config: {
      allowInsecureHttpUrls: true,
      logger: new ConsoleLogger(LogLevel.warn),
    },
    dependencies: agentDependencies,
    modules: getAgentModules(app),
  })

  await agent.initialize()
  console.log('✅ Credo Agent initialized')

  // ============================================
  // Import or generate Ed25519 signing key
  // ============================================
  const privateKeyHex = process.env.PRIVATE_KEY_HEX
  let keyId: string

  if (privateKeyHex) {
    // Extract raw 32-byte Ed25519 private key from PKCS8 or raw hex
    const hexBuffer = Buffer.from(privateKeyHex, 'hex')
    let rawKey: Buffer

    if (hexBuffer.length === 48) {
      // PKCS8 encoded — last 32 bytes are the raw key
      rawKey = hexBuffer.subarray(16, 48)
    } else if (hexBuffer.length === 32) {
      rawKey = hexBuffer
    } else {
      throw new Error(
        `Invalid PRIVATE_KEY_HEX length: ${hexBuffer.length} bytes. Expected 32 or 48.`
      )
    }

    const { privateJwk } = transformPrivateKeyToPrivateJwk({
      type: { crv: 'Ed25519', kty: 'OKP' },
      privateKey: CredoBuffer.from(rawKey),
    })

    const importResult = await agent.kms.importKey({ privateJwk })
    keyId = importResult.keyId
    console.log('🔑 Ed25519 signing key imported from PRIVATE_KEY_HEX')
  } else {
    // Generate a new Ed25519 key
    const createResult = await agent.kms.createKey({
      type: { crv: 'Ed25519', kty: 'OKP' },
    })
    keyId = createResult.keyId
    console.log('🔑 New Ed25519 signing key generated')
  }

  // ============================================
  // Create DID:key from the signing key
  // ============================================
  const didCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyId },
  })

  const did = didCreateResult.didState.did
  if (!did) {
    throw new Error('Failed to create DID:key — no DID returned')
  }

  agentDidKey = DidKeyClass.fromDid(did)
  const kid = `${did}#${agentDidKey.publicJwk.fingerprint}`

  console.log(`🔑 Issuer DID: ${did}`)
  console.log(`🔑 Key ID: ${kid}`)

  // ============================================
  // Create OpenID4VCI Issuer record
  // ============================================
  const issuerApi = agent.openid4vc!.issuer!

  issuerRecord = await issuerApi.createIssuer({
    credentialConfigurationsSupported,
    display: [
      {
        name: process.env.ISSUER_NAME || 'BPJS Kesehatan',
        description: 'Digital Credential Issuer — BPJS Healthcare Archive System',
        locale: 'id-ID',
      },
    ],
  })

  const issuerMetadata = await issuerApi.getIssuerMetadata(
    issuerRecord.issuerId
  )

  agentInitialized = true

  console.log('\n✅ Credo-TS OpenID4VCI Issuer Agent fully configured')
  console.log('📋 Protocol: OpenID for Verifiable Credential Issuance (OID4VCI)')
  console.log('📦 Credential format: vc+sd-jwt (SD-JWT Verifiable Credential)')
  console.log('🔑 Signing algorithm: EdDSA (Ed25519)')
  console.log('🔐 Flow: Pre-Authorized Code Flow')
  console.log(`📋 Credential Issuer URL: ${issuerMetadata.credentialIssuer.credential_issuer}\n`)
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get the issuer's DID (did:key created by Credo Agent)
 */
export function getIssuerDID(): string {
  if (agentDidKey) {
    return agentDidKey.did
  }
  // Fallback to did:web for display purposes before agent init
  const domain = process.env.DID_WEB_DOMAIN || 'localhost:3001'
  return `did:web:${domain}`
}

/**
 * Check if the agent is initialized and ready
 */
export function isAgentReady(): boolean {
  return agentInitialized
}

/**
 * Create a credential offer for the OID4VCI protocol.
 *
 * Uses Credo's OpenId4VcIssuerApi.createCredentialOffer() which:
 * - Creates an issuance session in Askar
 * - Generates a pre-authorized code
 * - Returns a credential offer URI for QR code encoding
 *
 * @param credentialData — The BPJS credential subject data from the admin form
 * @returns The credential offer URI and issuance session ID
 */
export async function createCredentialOffer(
  credentialData: CredentialMetadata
): Promise<CredentialOfferResult> {
  if (!agentInitialized || !agent) {
    throw new Error('Credo Agent not initialized. Call initializeCredoAgent() first.')
  }

  const issuerApi = agent.openid4vc!.issuer!

  // Get issuer metadata (needed for authorization server URL)
  const issuerMetadata = await issuerApi.getIssuerMetadata(
    issuerRecord.issuerId
  )

  // Create credential offer via Credo SDK
  const { credentialOffer, issuanceSession } =
    await issuerApi.createCredentialOffer({
      issuerId: issuerRecord.issuerId,
      credentialConfigurationIds: ['BPJSHealthCredential'],
      preAuthorizedCodeFlowConfig: {
        authorizationServerUrl:
          issuerMetadata.credentialIssuer.credential_issuer,
      },
    })

  // Store the BPJS data so the mapper can look it up when the holder claims
  pendingCredentials.set(issuanceSession.id, credentialData)

  console.log('📋 Credo: Credential offer created')
  console.log('📝 Session ID:', issuanceSession.id)
  console.log('👤 Holder:', credentialData.holderName)
  console.log('🔗 Offer URI length:', credentialOffer.length, 'characters')

  return {
    credentialOfferUri: credentialOffer,
    issuanceSessionId: issuanceSession.id,
  }
}

/**
 * Gracefully shutdown the Credo Agent
 */
export async function shutdownAgent(): Promise<void> {
  agentInitialized = false
  pendingCredentials.clear()

  if (agent) {
    await agent.shutdown()
    console.log('🔒 Credo-TS Agent shut down')
  }
}

/**
 * Get active pending credential count (for monitoring)
 */
export function getActiveSessionCount(): number {
  return pendingCredentials.size
}
