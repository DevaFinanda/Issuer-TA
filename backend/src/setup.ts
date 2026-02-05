import { generateKeyPair, getIssuerDID } from './agent.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import * as crypto from 'crypto'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function setup() {
  console.log('🔧 Setting up Issuer DID Web...\n')

  try {
    const domain = process.env.DID_WEB_DOMAIN || 'localhost:3000'
    const did = getIssuerDID()

    // Generate keypair
    console.log('🔐 Generating Ed25519 keypair...')
    const { publicKeyHex, privateKeyHex } = generateKeyPair()

    // Create DID Document
    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: `z${Buffer.from(publicKeyHex, 'hex').toString('base64url')}`,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    }

    // Save DID Document
    const wellKnownDir = path.join(__dirname, '../public/.well-known')
    if (!fs.existsSync(wellKnownDir)) {
      fs.mkdirSync(wellKnownDir, { recursive: true })
    }

    fs.writeFileSync(
      path.join(wellKnownDir, 'did.json'),
      JSON.stringify(didDocument, null, 2)
    )

    console.log('✅ DID Created:', did)
    console.log('✅ DID Document saved to public/.well-known/did.json')
    console.log(`📍 Access at: http://${domain}/.well-known/did.json\n`)

    // Update .env file
    const envPath = path.join(__dirname, '../.env')
    let envContent = fs.readFileSync(envPath, 'utf-8')
    envContent = envContent.replace(
      /PRIVATE_KEY_HEX=.*/,
      `PRIVATE_KEY_HEX=${privateKeyHex}`
    )
    fs.writeFileSync(envPath, envContent)

    console.log('✅ Private key saved to .env\n')
    console.log('📋 DID Document:')
    console.log(JSON.stringify(didDocument, null, 2))

    console.log('\n✅ Setup completed successfully!')
    console.log('\nNext steps:')
    console.log('1. Run: npm run dev')
    console.log('2. Access: http://localhost:3000\n')

    process.exit(0)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

setup()
