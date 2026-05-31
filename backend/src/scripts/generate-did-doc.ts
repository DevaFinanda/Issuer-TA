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
import { BASE_URL, ISSUER_DID, ISSUER_DID_DOMAIN, ISSUER_DID_KEY_ID } from '../lib/issuer-url.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============================================
// Derive Ed25519 public key from raw private key hex
// ============================================
function encodeBase58(bytes: Buffer): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1

  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry
      digits[i] = value % 58
      carry = Math.floor(value / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }

  return `${'1'.repeat(zeros)}${digits.reverse().map((digit) => alphabet[digit]).join('')}`
}

function toEd25519PublicKeyMultibase(rawPublicKey: Buffer): string {
  const ed25519PublicKeyMulticodec = Buffer.from([0xed, 0x01])
  return `z${encodeBase58(Buffer.concat([ed25519PublicKeyMulticodec, rawPublicKey]))}`
}

function derivePublicKeyMultibase(privateKeyHex: string): string {
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

  return toEd25519PublicKeyMultibase(rawPublicKey)
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

  const did = ISSUER_DID
  const keyId = ISSUER_DID_KEY_ID

  console.log(`\n🔑 Generating DID Document for: ${did}`)

  const publicKeyMultibase = derivePublicKeyMultibase(privateKeyHex)
  console.log(`🔑 Derived public key (multibase): ${publicKeyMultibase}`)

  const didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
      },
    ],
    assertionMethod: [keyId],
  }

  // Write to public/.well-known/did.json
  const outputDir = path.join(__dirname, '../../public/.well-known')
  const outputPath = path.join(outputDir, 'did.json')

  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(didDocument, null, 2), 'utf-8')

  console.log(`\n✅ DID Document written to: ${outputPath}`)
  console.log(`\n📋 DID Document preview:\n${JSON.stringify(didDocument, null, 2)}`)
  console.log(`\n📡 After deploying to VPS, verifiers can resolve:`)
  console.log(`   GET ${BASE_URL}/.well-known/did.json`)
  console.log(`   DID = did:web:${ISSUER_DID_DOMAIN}`)
  console.log(`\n⚠️  IMPORTANT: Restart the issuer server to serve the updated did.json`)
}

main()
