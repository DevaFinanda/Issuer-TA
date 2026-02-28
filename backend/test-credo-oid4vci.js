/**
 * Test OID4VCI Flow with Real Credo-TS Agent
 * Tests the full Pre-Authorized Code Flow (with JWT Proof of Key Possession)
 *
 * Uses Node.js built-in crypto for Ed25519 holder key pair generation and JWT signing.
 */

const crypto = require('crypto')

const BASE_URL = process.env.BASE_URL || 'http://202.155.132.71:3001'
const API_KEY = 'change-this-in-production'

// ========================================
// Helper: Create JWT proof for credential request
// ========================================
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createJwtProof(holderPrivateKey, holderPublicJwk, nonce, credentialIssuer) {
  const header = {
    alg: 'EdDSA',
    typ: 'openid4vci-proof+jwt',
    jwk: holderPublicJwk,
  }
  const payload = {
    aud: credentialIssuer,
    iat: Math.floor(Date.now() / 1000),
    nonce: nonce,
  }

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const signature = crypto.sign(null, Buffer.from(signingInput), holderPrivateKey)
  const signatureB64 = base64url(signature)

  return `${headerB64}.${payloadB64}.${signatureB64}`
}

function edPublicKeyToJwk(publicKey) {
  // Ed25519 public key is 32 bytes raw
  const rawKey = publicKey.export({ type: 'spki', format: 'der' })
  // SPKI DER for Ed25519: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
  const x = rawKey.subarray(rawKey.length - 32)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64url(x),
  }
}

async function main() {
  console.log('============================================================')
  console.log('  TEST FULL OID4VCI FLOW (Credo-TS Agent)')
  console.log('  Target:', BASE_URL)
  console.log('============================================================\n')

  // Generate Ed25519 holder key pair (simulates a wallet)
  const { publicKey: holderPublicKey, privateKey: holderPrivateKey } =
    crypto.generateKeyPairSync('ed25519')
  const holderPublicJwk = edPublicKeyToJwk(holderPublicKey)
  console.log('  Holder JWK:', JSON.stringify(holderPublicJwk))

  // ========================================
  // Step 1: Create Credential Offer
  // ========================================
  console.log('\n[STEP 1] Create Credential Offer via POST /api/issue')
  const issueRes = await fetch(`${BASE_URL}/api/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      documentId: 'DOC-CREDO-VPS-001',
      documentHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      documentType: 'BPJS_DOCUMENT',
      holderDID: 'did:key:z6MkholderCredo123',
      holderName: 'Test Credo Holder',
      noBPJS: '0009876543210',
      nik: '3301234567891234',
      tanggalLahir: '1995-06-20',
      alamat: 'Jl. Gatot Subroto No. 51, Jakarta Selatan 12190',
    }),
  })

  if (!issueRes.ok) {
    const errText = await issueRes.text()
    console.error('  ❌ Failed:', issueRes.status, errText)
    return
  }

  const issueData = await issueRes.json()
  console.log('  ✅ Credential offer created!')
  console.log('  Offer URI:', issueData.credentialOfferUri.substring(0, 80) + '...')
  console.log('  URI Length:', issueData.credentialOfferUri.length, 'characters')
  console.log('  Session ID:', issueData.issuanceSessionId)

  // ========================================
  // Step 2: Resolve Credential Offer
  // ========================================
  console.log('\n[STEP 2] Holder resolves credential offer URI')

  const offerUrl = new URL(issueData.credentialOfferUri)
  const credentialOfferUrl = offerUrl.searchParams.get('credential_offer_uri')
  console.log('  Offer URL:', credentialOfferUrl)

  const offerRes = await fetch(credentialOfferUrl)
  if (!offerRes.ok) {
    console.error('  ❌ Failed to resolve offer:', offerRes.status, await offerRes.text())
    return
  }

  const offerData = await offerRes.json()
  console.log('  ✅ Offer resolved!')
  console.log('  Credential Issuer:', offerData.credential_issuer)
  console.log('  Credential Config:', offerData.credential_configuration_ids)

  const preAuthCode = offerData.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']
  console.log('  Pre-Auth Code:', preAuthCode.substring(0, 20) + '...')

  // ========================================
  // Step 3: Discover Issuer Metadata
  // ========================================
  console.log('\n[STEP 3] Holder discovers issuer metadata')

  const metadataUrl = `${offerData.credential_issuer}/.well-known/openid-credential-issuer`
  const metadataRes = await fetch(metadataUrl)
  if (!metadataRes.ok) {
    console.error('  ❌ Failed:', metadataRes.status, await metadataRes.text())
    return
  }

  const metadata = await metadataRes.json()
  console.log('  ✅ Metadata discovered!')
  console.log('  Token Endpoint:', metadata.token_endpoint)
  console.log('  Credential Endpoint:', metadata.credential_endpoint)
  console.log('  Nonce Endpoint:', metadata.nonce_endpoint)
  console.log('  Format:', metadata.credential_configurations_supported?.BPJSHealthCredential?.format)

  // ========================================
  // Step 4: Exchange Pre-Auth Code for Token
  // ========================================
  console.log('\n[STEP 4] Holder exchanges pre-auth code for access token')

  const tokenRes = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'grant_type': 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthCode,
    }).toString(),
  })

  if (!tokenRes.ok) {
    const tokenErr = await tokenRes.json().catch(() => tokenRes.text())
    console.error('  ❌ Token exchange failed:', tokenRes.status, JSON.stringify(tokenErr))
    return
  }

  const tokenData = await tokenRes.json()
  console.log('  ✅ Access token received!')
  console.log('  Token type:', tokenData.token_type)
  console.log('  Expires in:', tokenData.expires_in + 's')
  console.log('  c_nonce:', tokenData.c_nonce ? 'present (' + tokenData.c_nonce.substring(0, 20) + '...)' : 'absent')

  // ========================================
  // Step 5: Request Credential (with JWT Proof)
  // ========================================
  console.log('\n[STEP 5] Holder requests SD-JWT VC with JWT proof')

  // Get nonce — from token response or nonce endpoint
  let nonce = tokenData.c_nonce
  if (!nonce && metadata.nonce_endpoint) {
    console.log('  Fetching nonce from nonce endpoint...')
    const nonceRes = await fetch(metadata.nonce_endpoint, { method: 'POST' })
    if (nonceRes.ok) {
      const nonceData = await nonceRes.json()
      nonce = nonceData.c_nonce
    }
  }

  if (!nonce) {
    console.error('  ❌ No c_nonce available for proof generation')
    return
  }

  // Create JWT proof of key possession (proves holder controls the key)
  const jwtProof = createJwtProof(
    holderPrivateKey,
    holderPublicJwk,
    nonce,
    offerData.credential_issuer
  )
  console.log('  JWT Proof created (length:', jwtProof.length, 'chars)')

  const credentialReqBody = {
    format: 'vc+sd-jwt',
    vct: 'BPJSHealthCredential',
    credential_configuration_id: 'BPJSHealthCredential',
    proof: {
      proof_type: 'jwt',
      jwt: jwtProof,
    },
  }

  const credentialRes = await fetch(metadata.credential_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify(credentialReqBody),
  })

  if (!credentialRes.ok) {
    const credErrText = await credentialRes.text()
    let credErr
    try { credErr = JSON.parse(credErrText) } catch { credErr = credErrText }
    console.error('  ❌ Credential request failed:', credentialRes.status, JSON.stringify(credErr))

    // If c_nonce was refreshed, retry with the new one
    if (credErr?.c_nonce && credErr.error === 'invalid_proof') {
      console.log('  🔄 Retrying with refreshed c_nonce...')
      const retryProof = createJwtProof(
        holderPrivateKey,
        holderPublicJwk,
        credErr.c_nonce,
        offerData.credential_issuer
      )
      credentialReqBody.proof.jwt = retryProof
      const retryRes = await fetch(metadata.credential_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
        body: JSON.stringify(credentialReqBody),
      })
      if (!retryRes.ok) {
        const retryErr = await retryRes.text()
        console.error('  ❌ Retry failed:', retryRes.status, retryErr)
        return
      }
      const retryData = await retryRes.json()
      printCredential(retryData, issueData)
      return
    }
    return
  }

  const credentialData = await credentialRes.json()
  printCredential(credentialData, issueData)
}

function printCredential(credentialData, issueData) {
  console.log('  ✅ SD-JWT VC received!')
  console.log('  Format:', credentialData.format)

  const credential = credentialData.credentials?.[0]?.credential || credentialData.credential
  if (credential) {
    console.log('  JWT length:', credential.length, 'characters')

    // Parse SD-JWT components
    const parts = credential.split('~')
    const jwtPart = parts[0]
    const disclosures = parts.slice(1).filter(p => p.length > 0)
    console.log('  Disclosures:', disclosures.length, 'selective disclosure fields')

    // Decode disclosures
    disclosures.forEach((d, i) => {
      try {
        const decoded = JSON.parse(Buffer.from(d, 'base64url').toString())
        console.log(`    [${i + 1}] ${decoded[1]}: ${decoded[2]}`)
      } catch { console.log(`    [${i + 1}] (raw): ${d.substring(0, 40)}...`) }
    })

    // Decode JWT header
    const headerB64 = jwtPart.split('.')[0]
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
    console.log('  JWT Header:', JSON.stringify(header))

    // Decode JWT payload
    const payloadB64 = jwtPart.split('.')[1]
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    console.log('  VCT:', payload.vct)
    console.log('  Issuer (iss):', payload.iss)
    console.log('  Has _sd:', payload._sd ? `yes (${payload._sd.length} hashes)` : 'no')
    console.log('  Has cnf:', payload.cnf ? 'yes — ' + JSON.stringify(payload.cnf) : 'no')
    console.log('  Document:', JSON.stringify(payload.document))
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n============================================================')
  console.log('  ✅ ALL 5 STEPS PASSED — Credo-TS OID4VCI Flow Complete!')
  console.log('============================================================')
  console.log('  Library: @credo-ts/openid4vc v0.6.2 (OpenWallet Foundation)')
  console.log('  Protocol: OpenID for Verifiable Credential Issuance')
  console.log('  Flow: Pre-Authorized Code Flow')
  console.log('  Credential Format: vc+sd-jwt (SD-JWT DC)')
  console.log('  Holder Binding: JWT key proof (Ed25519)')
  console.log('  QR Code URI length:', issueData.credentialOfferUri.length, 'chars')
  console.log('============================================================')
}

main().catch(console.error)
