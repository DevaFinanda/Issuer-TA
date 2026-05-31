/**
 * Credo-TS Agent — Key Management Only (did:web)
 *
 * Uses Aries Askar for secure Ed25519 key storage.
 * DID is did:web — static, derived from ISSUER_DOMAIN env var.
 * OID4VCI protocol endpoints are handled manually via Express routes.
 *
 * Key components:
 *   - @credo-ts/core       — Credo Agent, key management
 *   - @credo-ts/askar      — Aries Askar secure key store
 *   - @credo-ts/node       — Node.js platform bindings
 *
 * Exports:
 *   - initializeCredoAgent()  — Initialize agent and import signing key
 *   - getIssuerDID()          — Returns did:web:<ISSUER_DOMAIN>
 *   - isAgentReady()          — Check if agent is initialized
 *   - shutdownAgent()         — Graceful shutdown
 */

import {
  Agent,
  ConsoleLogger,
  LogLevel,
  Kms,
  Buffer as CredoBuffer,
} from '@credo-ts/core'
import {
  agentDependencies,
  NodeKeyManagementService,
  NodeInMemoryKeyManagementStorage,
} from '@credo-ts/node'
import { AskarModule, transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import { askar } from '@openwallet-foundation/askar-nodejs'
import dotenv from 'dotenv'
import { DID_DOCUMENT_URL, ISSUER_DID } from './lib/issuer-url.js'

dotenv.config()

// ============================================
// MODULE-LEVEL STATE
// ============================================

let agent: Agent<{
  askar: AskarModule
  kms: Kms.KeyManagementModule
}>

let agentInitialized = false

// ============================================
// AGENT MODULES
// ============================================

function getAgentModules() {
  return {
    askar: new AskarModule({
      askar,
      store: {
        id: 'issuer-identity',
        key: 'issuer-identity-credential-store',
      },
    }),
    kms: new Kms.KeyManagementModule({
      backends: [
        new NodeKeyManagementService(new NodeInMemoryKeyManagementStorage()),
      ],
    }),
    // NOTE: OpenId4VcModule removed — OID4VCI endpoints are now manual Express routes
  }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the Credo-TS Agent (Key Management only — did:web is static)
 */
export async function initializeCredoAgent(): Promise<void> {
  console.log('\n🚀 Initializing Credo-TS Agent (Key Management for did:web)...')

  agent = new Agent({
    config: {
      allowInsecureHttpUrls: true,
      logger: new ConsoleLogger(LogLevel.warn),
    },
    dependencies: agentDependencies,
    modules: getAgentModules(),
  })

  await agent.initialize()
  console.log('✅ Credo Agent initialized')

  // ============================================
  // Import or generate Ed25519 signing key
  // ============================================
  const privateKeyHex = process.env.PRIVATE_KEY_HEX
  let keyId: string

  if (privateKeyHex) {
    const hexBuffer = Buffer.from(privateKeyHex, 'hex')
    let rawKey: Buffer

    if (hexBuffer.length === 48) {
      rawKey = hexBuffer.subarray(16, 48)
    } else if (hexBuffer.length === 32) {
      rawKey = hexBuffer
    } else {
      throw new Error(`Invalid PRIVATE_KEY_HEX length: ${hexBuffer.length} bytes. Expected 32 or 48.`)
    }

    const { privateJwk } = transformPrivateKeyToPrivateJwk({
      type: { crv: 'Ed25519', kty: 'OKP' },
      privateKey: CredoBuffer.from(rawKey),
    })

    const importResult = await agent.kms.importKey({ privateJwk })
    keyId = importResult.keyId
    console.log('🔑 Ed25519 signing key imported from PRIVATE_KEY_HEX')
  } else {
    const createResult = await agent.kms.createKey({
      type: { crv: 'Ed25519', kty: 'OKP' },
    })
    keyId = createResult.keyId
    console.log('⚠️  No PRIVATE_KEY_HEX set — generated ephemeral key (not persistent!)')
    console.log('⚠️  Run: npm run did:generate to create a persistent key pair')
  }

  agentInitialized = true

  const did = getIssuerDID()
  console.log(`\n✅ Credo-TS Agent ready`)
  console.log(`🌐 Issuer DID: ${did}`)
  console.log(`📄 DID Document: ${DID_DOCUMENT_URL}`)
  console.log(`📋 Protocol: OID4VCI Authorization Code Flow`)
  console.log(`📦 Credential format: jwt_vc_json\n`)
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Returns the issuer's did:web DID.
 * Format: did:web:<issuer-domain>
 * e.g.    did:web:issuer.identia.my.id
 *
 * The corresponding DID Document is served at:
 *   https://issuer.identia.my.id/.well-known/did.json
 */
export function getIssuerDID(): string {
  return ISSUER_DID
}

/**
 * Check if the agent is initialized
 */
export function isAgentReady(): boolean {
  return agentInitialized
}

/**
 * Graceful shutdown
 */
export async function shutdownAgent(): Promise<void> {
  agentInitialized = false
  if (agent) {
    await agent.shutdown()
    console.log('🔒 Credo-TS Agent shut down')
  }
}
