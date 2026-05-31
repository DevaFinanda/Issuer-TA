export const BASE_URL = 'https://issuer.identia.my.id'

export const ISSUER_DID_DOMAIN = 'issuer.identia.my.id'
export const ISSUER_DID = `did:web:${ISSUER_DID_DOMAIN}`
export const SIGNING_KID = `${ISSUER_DID}#key-1`
export const ISSUER_DID_KEY_ID = SIGNING_KID
export const DID_DOCUMENT_URL = `${BASE_URL}/.well-known/did.json`

const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, '')
}

export function assertCanonicalRuntimeConfig(): void {
  const envIssuerDid = String(process.env.ISSUER_DID || '').trim()
  if (envIssuerDid) {
    if (IPV4_REGEX.test(envIssuerDid)) {
      throw new Error(`Invalid ISSUER_DID override: IP-based DID is not allowed (${envIssuerDid})`)
    }

    if (envIssuerDid !== ISSUER_DID) {
      throw new Error(`Invalid ISSUER_DID override: expected ${ISSUER_DID}, got ${envIssuerDid}`)
    }
  }

  const envBaseUrl = String(process.env.BASE_URL || '').trim()
  if (envBaseUrl) {
    const normalizedBaseUrl = normalizeUrl(envBaseUrl)
    if (!normalizedBaseUrl.startsWith('https://')) {
      throw new Error(`Invalid BASE_URL override: HTTPS is required (${envBaseUrl})`)
    }

    if (normalizedBaseUrl !== BASE_URL) {
      throw new Error(`Invalid BASE_URL override: expected ${BASE_URL}, got ${envBaseUrl}`)
    }
  }

  const envIssuerBaseUrl = String(process.env.ISSUER_BASE_URL || '').trim()
  if (envIssuerBaseUrl) {
    const normalizedIssuerBase = normalizeUrl(envIssuerBaseUrl)
    if (!normalizedIssuerBase.startsWith('https://')) {
      throw new Error(`Invalid ISSUER_BASE_URL override: HTTPS is required (${envIssuerBaseUrl})`)
    }

    if (normalizedIssuerBase !== BASE_URL) {
      throw new Error(`Invalid ISSUER_BASE_URL override: expected ${BASE_URL}, got ${envIssuerBaseUrl}`)
    }
  }

  const envDidDomain = String(process.env.DID_WEB_DOMAIN || process.env.ISSUER_DOMAIN || '').trim()
  if (envDidDomain && envDidDomain !== ISSUER_DID_DOMAIN) {
    throw new Error(`Invalid DID domain override: expected ${ISSUER_DID_DOMAIN}, got ${envDidDomain}`)
  }
}

export const ISSUER_ENDPOINTS = {
  authorization: `${BASE_URL}/oid4vci/authorize`,
  token: `${BASE_URL}/oid4vci/token`,
  credential: `${BASE_URL}/oid4vci/credential`,
  credentialOffer: `${BASE_URL}/oid4vci/credential-offer`,
  credentialStatusBase: `${BASE_URL}/oid4vci/credential/status`,
} as const
