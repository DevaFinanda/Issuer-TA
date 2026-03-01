const BASE = 'http://localhost:3001';
const re = /http:\/\/[^:\/]+:3001/;

async function test() {
  // Step 1: Create offer
  const issueRes = await fetch(BASE + '/api/issue', {
    method: 'POST', headers: {'Content-Type':'application/json','X-API-Key':'change-this-in-production'},
    body: JSON.stringify({documentId:'DOC-FINAL-DBG',documentHash:'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',documentType:'BPJS_DOCUMENT',holderDID:'did:key:z6MkFinalDbg',holderName:'Final Debug User',noBPJS:'0009876543210',nik:'3301234567891234',tanggalLahir:'1995-06-20',alamat:'Jl Gatot Subroto No 51 Jakarta Selatan 12190'})
  });
  const issue = await issueRes.json();
  console.log('Step 1 OK: offer created');
  
  // Step 2: Resolve offer
  const offerUrl = new URL(issue.credentialOfferUri);
  const credOfferUrl = offerUrl.searchParams.get('credential_offer_uri').replace(re, BASE);
  const offer = await (await fetch(credOfferUrl)).json();
  const preAuthCode = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];
  console.log('Step 2 OK: offer resolved');
  
  // Step 3: Get metadata
  const metaUrl = offer.credential_issuer.replace(re, BASE) + '/.well-known/openid-credential-issuer';
  const meta = await (await fetch(metaUrl)).json();
  console.log('Step 3 OK: metadata fetched');
  
  // Step 4: Token exchange
  const tokenUrl = meta.token_endpoint.replace(re, BASE);
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=' + encodeURIComponent(preAuthCode)
  });
  const token = await tokenRes.json();
  console.log('Step 4 OK: token received');
  console.log('  access_token:', token.access_token?.substring(0, 30) + '...');
  console.log('  c_nonce:', token.c_nonce);
  
  // Step 5: Credential request
  const credUrl = meta.credential_endpoint.replace(re, BASE);
  console.log('\nStep 5: POST', credUrl);
  
  const credReqBody = {
    format: 'vc+sd-jwt',
    vct: 'BPJSHealthCredential',
    credential_identifier: 'BPJSHealthCredential',
  };
  console.log('Request body:', JSON.stringify(credReqBody));
  
  const credRes = await fetch(credUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token.access_token,
    },
    body: JSON.stringify(credReqBody)
  });
  
  console.log('Response status:', credRes.status);
  const hdrs = {};
  credRes.headers.forEach((v, k) => hdrs[k] = v);
  console.log('Response headers:', JSON.stringify(hdrs, null, 2));
  const body = await credRes.text();
  console.log('Response body:', body.substring(0, 2000));
}

test().catch(console.error);
