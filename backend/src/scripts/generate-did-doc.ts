#!/usr/bin/env tsx
/**
 * Generate DID Document for did:web
 *
 * Reads PRIVATE_KEY_HEX from .env, derives the Ed25519 public key,
 * and writes the DID Document to public/.well-known/did.json
 *
 * Usage:
 *   npm run did:generate
 *
 * After running, deploy did.json to VPS so verifiers can resolve:
 *   GET http(s)://<ISSUER_DOMAIN>/.well-known/did.json
 */

import { createPrivateKey, createPublicKey } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============================================
// Derive Ed25519 public key from raw private key hex
// ============================================
function derivePublicKeyJwk(privateKeyHex: string): { x: string } {
  const hexBuffer = Buffer.from(privateKeyHex, 'hex')
  let rawPrivateKey: Buffer

  if (hexBuffer.length === 48) {
    // PKCS8 DER — last 32 bytes are the raw Ed25519 private key
    rawPrivateKey = hexBuffer.subarray(16, 48)
  } else if (hexBuffer.length === 32) {
    rawPrivateKey = hexBuffer
  } else {
    throw new Error(`Invalid PRIVATE_KEY_HEX length: ${hexBuffer.length} bytes. Expected 32 or 48.`)
  }

  // Wrap as PKCS8 DER so Node.js crypto can parse it
  // PKCS8 header for Ed25519 (OID 1.3.101.112): 302e020100300506032b657004220420
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex')
  const pkcs8Der = Buffer.concat([pkcs8Header, rawPrivateKey])

  const privateKeyObj = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' })
  const publicKeyObj = createPublicKey(privateKeyObj)

  // SPKI DER — last 32 bytes are the raw Ed25519 public key
  const spkiDer = publicKeyObj.export({ type: 'spki', format: 'der' }) as Buffer
  const rawPublicKey = spkiDer.subarray(-32)

  return {
    // Ed25519 JWK: `x` = base64url of 32-byte public key
    x: rawPublicKey.toString('base64url'),
  }
}

// ============================================
// Main
// ============================================
function main() {
  const privateKeyHex = process.env.PRIVATE_KEY_HEX
  if (!privateKeyHex) {
    console.error('❌ PRIVATE_KEY_HEX is not set in .env')
    process.exit(1)
  }

  const issuerDomain = process.env.ISSUER_DOMAIN
  if (!issuerDomain) {
    console.error('❌ ISSUER_DOMAIN is not set in .env (e.g. 202.155.132.71 or issuer.example.com)')
    process.exit(1)
  }

  const did = `did:web:${issuerDomain}`
  const keyId = `${did}#key-1`

  console.log(`\n🔑 Generating DID Document for: ${did}`)

  const { x } = derivePublicKeyJwk(privateKeyHex)
  console.log(`🔑 Derived public key (x): ${x}`)

  const didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: x,
        },
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: [
      {
        id: `${did}#issuer-service`,
        type: 'VerifiableCredentialIssuer',
        serviceEndpoint: `http://${issuerDomain}:${process.env.PORT || 3001}`,
      },
    ],
  }

  // Write to public/.well-known/did.json
  const outputDir = path.join(__dirname, '../../public/.well-known')
  const outputPath = path.join(outputDir, 'did.json')

  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(didDocument, null, 2), 'utf-8')

  console.log(`\n✅ DID Document written to: ${outputPath}`)
  console.log(`\n📋 DID Document preview:\n${JSON.stringify(didDocument, null, 2)}`)
  console.log(`\n📡 After deploying to VPS, verifiers can resolve:`)
  console.log(`   GET http://${issuerDomain}/.well-known/did.json`)
  console.log(`\n⚠️  IMPORTANT: Restart the issuer server to serve the updated did.json`)
}

main()
