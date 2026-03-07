/**
 * Credo-TS Agent — Simplified for DID & Key Management Only
 *
 * Uses Aries Askar for secure key storage and DID:key for credential signing.
 * OID4VCI protocol endpoints are now handled manually via Express routes
 * (not via the Credo OpenId4VcModule).
 *
 * Key components:
 *   - @credo-ts/core       — Credo Agent, DID management
 *   - @credo-ts/askar      — Aries Askar secure key store
 *   - @credo-ts/node       — Node.js platform bindings
 *
 * Exports:
 *   - initializeCredoAgent()  — Initialize agent and create/reuse DID:key
 *   - getIssuerKeyAndDid()    — Get issuer DID for VC signing
 *   - isAgentReady()          — Check if agent is initialized
 *   - shutdownAgent()         — Graceful shutdown
 */

import type { DidKey } from '@credo-ts/core'
import {
  Agent,
  ConsoleLogger,
  LogLevel,
  DidKey as DidKeyClass,
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

dotenv.config()

// ============================================
// MODULE-LEVEL STATE
// ============================================

let agent: Agent<{
  askar: AskarModule
  kms: Kms.KeyManagementModule
}>

let agentDidKey: DidKey
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
 * Initialize the Credo-TS Agent (DID + Key Management only)
 */
export async function initializeCredoAgent(): Promise<void> {
  console.log('\n🚀 Initializing Credo-TS Agent (DID + Key Management)...')

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
    console.log('🔑 New Ed25519 signing key generated')
  }

  // ============================================
  // Create or reuse DID:key
  // ============================================
  let did: string
  try {
    const didCreateResult = await agent.dids.create({
      method: 'key',
      options: { keyId },
    })
    did = didCreateResult.didState.did!
    if (!did) throw new Error('Failed to create DID:key — no DID returned')
    console.log(`🔑 New DID created: ${did}`)
  } catch (e: any) {
    const existingDids = await agent.dids.getCreatedDids({ method: 'key' })
    if (existingDids.length === 0) throw e
    did = existingDids[0].did
    console.log(`♻️  Reusing existing DID: ${did}`)
  }

  agentDidKey = DidKeyClass.fromDid(did)
  agentInitialized = true

  console.log(`\n✅ Credo-TS Agent ready`)
  console.log(`🔑 Issuer DID: ${did}`)
  console.log(`📋 Protocol: OID4VCI Authorization Code Flow`)
  console.log(`📦 Credential format: jwt_vc_json\n`)
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get the issuer's DID
 */
export function getIssuerDID(): string {
  if (agentDidKey) {
    return agentDidKey.did
  }
  const domain = process.env.ISSUER_DOMAIN || 'localhost:3001'
  return `did:web:${domain}`
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
