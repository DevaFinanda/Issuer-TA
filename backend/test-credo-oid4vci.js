/**
 * Test OID4VCI Flow with Real Credo-TS Agent
 * Tests the full Pre-Authorized Code Flow
 */

const BASE_URL = 'http://localhost:3001'
const API_KEY = 'change-this-in-production'

async function main() {
  console.log('============================================================')
  console.log('  TEST FULL OID4VCI FLOW (Credo-TS Agent)')
  console.log('============================================================\n')

  // ========================================
  // Step 1: Create Credential Offer
  // ========================================
  console.log('[STEP 1] Create Credential Offer via POST /api/issue')
  const issueRes = await fetch(`${BASE_URL}/api/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      documentId: 'DOC-CREDO-TEST-001',
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
  
  // Parse offer URI to get the credential_offer_uri parameter
  const offerUrl = new URL(issueData.credentialOfferUri)
  let credentialOfferUrl = offerUrl.searchParams.get('credential_offer_uri')
  // Replace external IP with localhost for local testing
  credentialOfferUrl = credentialOfferUrl.replace(/http:\/\/[^:\/]+:3001/, BASE_URL)
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
  
  const metadataUrl = `${offerData.credential_issuer}/.well-known/openid-credential-issuer`.replace(/http:\/\/[^:\/]+:3001/, BASE_URL)
  const metadataRes = await fetch(metadataUrl)
  if (!metadataRes.ok) {
    console.error('  ❌ Failed:', metadataRes.status, await metadataRes.text())
    return
  }

  const metadata = await metadataRes.json()
  console.log('  ✅ Metadata discovered!')
  console.log('  Token Endpoint:', metadata.token_endpoint)
  console.log('  Credential Endpoint:', metadata.credential_endpoint)
  console.log('  Format:', metadata.credential_configurations_supported?.BPJSHealthCredential?.format)

  // Replace external IP with localhost for local testing
  const tokenEndpoint = metadata.token_endpoint.replace(/http:\/\/[^:\/]+:3001/, BASE_URL)
  const credentialEndpoint = metadata.credential_endpoint.replace(/http:\/\/[^:\/]+:3001/, BASE_URL)
  const nonceEndpoint = metadata.nonce_endpoint ? metadata.nonce_endpoint.replace(/http:\/\/[^:\/]+:3001/, BASE_URL) : null

  // ========================================
  // Step 4: Exchange Pre-Auth Code for Token
  // ========================================
  console.log('\n[STEP 4] Holder exchanges pre-auth code for access token')

  const tokenRes = await fetch(tokenEndpoint, {
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
  console.log('  c_nonce:', tokenData.c_nonce ? 'present' : 'absent')

  // ========================================
  // Step 5: Request Credential
  // ========================================
  console.log('\n[STEP 5] Holder requests SD-JWT VC')

  // Get nonce for proof
  let nonce = tokenData.c_nonce
  if (!nonce && nonceEndpoint) {
    const nonceRes = await fetch(nonceEndpoint, { method: 'POST' })
    if (nonceRes.ok) {
      const nonceData = await nonceRes.json()
      nonce = nonceData.c_nonce
    }
  }

  const credentialRes = await fetch(credentialEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      format: 'vc+sd-jwt',
      vct: 'BPJSHealthCredential',
    }),
  })

  if (!credentialRes.ok) {
    const credErrText = await credentialRes.text()
    let credErr
    try { credErr = JSON.parse(credErrText) } catch { credErr = credErrText }
    console.error('  ❌ Credential request failed:', credentialRes.status, JSON.stringify(credErr))
    return
  }

  const credentialData = await credentialRes.json()
  console.log('  ✅ SD-JWT VC received!')
  console.log('  Format:', credentialData.format)
  
  const credential = credentialData.credential || credentialData.credentials?.[0]?.credential
  if (credential) {
    console.log('  JWT length:', credential.length, 'characters')
    
    // Parse SD-JWT components
    const parts = credential.split('~')
    const jwtPart = parts[0]
    const disclosures = parts.slice(1).filter(p => p.length > 0)
    console.log('  Disclosures:', disclosures.length, 'selective disclosure fields')
    
    // Decode JWT header
    const headerB64 = jwtPart.split('.')[0]
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
    console.log('  JWT Header:', JSON.stringify(header))
    
    // Decode JWT payload (without verifying signature)
    const payloadB64 = jwtPart.split('.')[1]
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    console.log('  VCT:', payload.vct)
    console.log('  Issuer (iss):', payload.iss)
    console.log('  Has _sd:', payload._sd ? `yes (${payload._sd.length} hashes)` : 'no')
    console.log('  Has cnf:', payload.cnf ? 'yes' : 'no')
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n============================================================')
  console.log('  SUMMARY')
  console.log('============================================================')
  console.log('  Library: @credo-ts/openid4vc (OpenWallet Foundation)')
  console.log('  Protocol: OpenID for Verifiable Credential Issuance')
  console.log('  Flow: Pre-Authorized Code Flow')
  console.log('  Credential Format: vc+sd-jwt')
  console.log('  QR Code URI length:', issueData.credentialOfferUri.length, 'chars')
  console.log('  ✅ ALL STEPS PASSED — Credo-TS OID4VCI Flow Complete!')
  console.log('============================================================')
}

main().catch(console.error)
