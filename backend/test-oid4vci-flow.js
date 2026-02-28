// Test script: Full OID4VCI flow end-to-end
// Jalankan: node test-oid4vci-flow.js

const BASE_URL = 'http://localhost:3001'
const API_KEY = 'change-this-in-production'

async function testFullFlow() {
  console.log('='.repeat(60))
  console.log('  TEST FULL OID4VCI FLOW')
  console.log('='.repeat(60))

  // ========== STEP 1: Issue - buat credential offer ==========
  console.log('\n[STEP 1] Buat Credential Offer via POST /api/issue')
  const issueRes = await fetch(`${BASE_URL}/api/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      documentId: 'FLOW-FULL-TEST-001',
      documentHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      documentType: 'BPJS_DOCUMENT',
      holderDID: 'did:key:z6MkEndToEndTest123',
      holderName: 'Ahmad Fauzi',
      noBPJS: '9876543210987',
      nik: '3201234567890003',
      tanggalLahir: '1995-03-10',
      alamat: 'Jl. Gatot Subroto No. 5, Jakarta Selatan, DKI Jakarta',
    }),
  })
  const issueData = await issueRes.json()
  
  if (!issueData.success) {
    console.error('GAGAL step 1:', issueData)
    process.exit(1)
  }

  const { credentialOfferUri, issuanceSessionId } = issueData
  console.log(`  ✅ Credential offer dibuat!`)
  console.log(`  Session ID : ${issuanceSessionId}`)
  console.log(`  Offer URI  : ${credentialOfferUri}`)
  console.log(`  URI Length : ${credentialOfferUri.length} karakter`)
  console.log(`  Protocol   : ${credentialOfferUri.startsWith('openid-credential-offer://') ? '✅ openid-credential-offer:// (OID4VCI standar!)' : '❌ BUKAN OID4VCI!'}`)
  console.log(`  Ada JWT?   : ${credentialOfferUri.includes('eyJ') ? '❌ YA (masalah!)' : '✅ TIDAK (QR bersih!)'}`)

  // ========== STEP 2: Resolve offer (simulasi holder scan QR) ==========
  console.log('\n[STEP 2] Holder Scan QR → Resolve Offer')
  const offerRes = await fetch(`${BASE_URL}/oid4vci/offers/${issuanceSessionId}`)
  const offerData = await offerRes.json()
  
  const preAuthCode = offerData.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code']
  console.log(`  ✅ Offer resolved!`)
  console.log(`  Credential config: ${offerData.credential_configuration_ids?.[0]}`)
  console.log(`  Pre-auth code: ${preAuthCode?.substring(0, 20)}...`)

  // ========== STEP 3: Discover metadata ==========
  console.log('\n[STEP 3] Holder Discover Issuer Metadata')
  const metaRes = await fetch(`${BASE_URL}/oid4vci/.well-known/openid-credential-issuer`)
  const metaData = await metaRes.json()
  console.log(`  ✅ Metadata ditemukan!`)
  console.log(`  Issuer: ${metaData.credential_issuer}`)
  console.log(`  Format: ${metaData.credential_configurations_supported?.BPJSHealthCredential?.format}`)
  console.log(`  Algo  : ${metaData.credential_configurations_supported?.BPJSHealthCredential?.credential_signing_alg_values_supported?.[0]}`)

  // ========== STEP 4: Token exchange ==========
  console.log('\n[STEP 4] Holder Exchange Pre-Auth Code → Access Token')
  const tokenRes = await fetch(`${BASE_URL}/oid4vci/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthCode,
    }),
  })
  const tokenData = await tokenRes.json()
  
  if (!tokenData.access_token) {
    console.error('GAGAL step 4:', tokenData)
    process.exit(1)
  }
  console.log(`  ✅ Access token diterima!`)
  console.log(`  Token type: ${tokenData.token_type}`)
  console.log(`  Expires in: ${tokenData.expires_in}s`)

  // ========== STEP 5: Request credential ==========
  console.log('\n[STEP 5] Holder Request SD-JWT VC')
  const credRes = await fetch(`${BASE_URL}/oid4vci/credential`, {
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
  const credData = await credRes.json()
  
  if (!credData.credential) {
    console.error('GAGAL step 5:', credData)
    process.exit(1)
  }

  const sdJwt = credData.credential
  const parts = sdJwt.split('~')
  console.log(`  ✅ SD-JWT VC diterima!`)
  console.log(`  Format    : ${credData.format}`)
  console.log(`  JWT length: ${sdJwt.length} karakter`)
  console.log(`  Disclosures: ${parts.length - 1} bidang selective`)
  console.log(`  JWT header: ${sdJwt.substring(0, 50)}...`)

  // ========== RINGKASAN ==========
  console.log('\n' + '='.repeat(60))
  console.log('  RINGKASAN PERBANDINGAN QR CODE')
  console.log('='.repeat(60))
  console.log(`  QR LAMA (raw SD-JWT)  : ${sdJwt.length} karakter  ← TIDAK BISA DISCAN (terlalu besar!)`)
  console.log(`  QR BARU (offer URI)   : ${credentialOfferUri.length} karakter  ← MUDAH DISCAN!`)
  console.log(`  Pengurangan           : ${Math.round((1 - credentialOfferUri.length/sdJwt.length)*100)}% lebih kecil`)
  console.log(`  QR Version estimasi lama: v25-v35 (177x177 modules, sulit discan)`)
  console.log(`  QR Version estimasi baru: v5-v8  (37-55 modules, mudah discan)`)
  console.log('\n' + '='.repeat(60))
  console.log('  ✅ SEMUA 5 STEP OID4VCI BERHASIL!')
  console.log('='.repeat(60))
}

testFullFlow().catch(console.error)
