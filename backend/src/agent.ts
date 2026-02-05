import { Resolver } from 'did-resolver'
import { getResolver } from 'web-did-resolver'
import * as didJWT from 'did-jwt'
import * as crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

// DID Resolver for did:web
export const resolver = new Resolver(getResolver())

// Generate Ed25519 keypair
export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  })

  return {
    publicKeyHex: publicKey.toString('hex'),
    privateKeyHex: privateKey.toString('hex'),
  }
}

// Extract raw Ed25519 private key from PKCS8 format
function extractRawPrivateKey(pkcs8Hex: string): Buffer {
  const pkcs8Buffer = Buffer.from(pkcs8Hex, 'hex')
  
  // PKCS8 Ed25519 format: 48 bytes total
  // Header: 16 bytes
  // Raw key: 32 bytes (last 32 bytes)
  if (pkcs8Buffer.length === 48) {
    return pkcs8Buffer.slice(16, 48) // Extract bytes 16-47 (32 bytes)
  }
  
  // If already raw key (32 bytes), return as is
  if (pkcs8Buffer.length === 32) {
    return pkcs8Buffer
  }
  
  throw new Error(`Invalid private key length: ${pkcs8Buffer.length} bytes. Expected 32 or 48 bytes.`)
}

// Create Signer from private key
export function createSigner(privateKeyHex: string) {
  const rawPrivateKey = extractRawPrivateKey(privateKeyHex)
  
  return didJWT.EdDSASigner(rawPrivateKey)
}

// Get Issuer DID
export function getIssuerDID(): string {
  const domain = process.env.DID_WEB_DOMAIN || 'localhost:3000'
  return `did:web:${domain}`
}

// Get Private Key from env
export function getPrivateKey(): string {
  const privateKey = process.env.PRIVATE_KEY_HEX
  if (!privateKey) {
    throw new Error('PRIVATE_KEY_HEX not set. Please run: npm run setup')
  }
  return privateKey
}
