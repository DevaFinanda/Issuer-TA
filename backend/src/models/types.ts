/**
 * TypeScript type definitions for OID4VCI Issuer
 */

// ============================================
// OID4VCI Protocol Types
// ============================================

export interface IssuerMetadata {
  credential_issuer: string
  authorization_endpoint: string
  token_endpoint: string
  credential_endpoint: string
  credentials_supported: CredentialSupported[]
}

export interface CredentialSupported {
  format: string
  id?: string
  types: string[]
  display?: Array<{
    name: string
    locale?: string
    description?: string
  }>
}

export interface CredentialOffer {
  credential_issuer: string
  credential_configuration_ids: string[]
  grants: {
    authorization_code?: {
      issuer_state?: string
      authorization_server?: string
    }
    'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
      'pre-authorized_code': string
      user_pin_required?: boolean
    }
  }
}

export interface CredentialOfferResponse {
  credentialOffer: CredentialOffer
  credentialOfferUri: string
  qrCode: string
  offerId: string
}

export interface TokenRequest {
  grant_type: string
  code: string
  client_id: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  c_nonce: string
  c_nonce_expires_in: number
}

export interface CredentialRequest {
  format: string
  credential_definition: {
    type: string[]
  }
  proof: {
    proof_type: 'jwt'
    jwt: string
  }
}

export interface CredentialResponse {
  format: string
  credential: string
}

// ============================================
// VC (Verifiable Credential) Types
// ============================================

export interface VCPayload {
  iss: string
  sub?: string
  iat: number
  vc: {
    '@context': string[]
    type: string[]
    credentialSubject: CredentialSubject
    issuanceDate: string
    issuer: string
  }
}

export interface CredentialSubject {
  holderName: string
  nik: string
  noBPJS: string
  tanggalLahir?: string
}

// ============================================
// Authorization Types
// ============================================

export interface AuthorizeRequest {
  identifier: string
  password: string
  client_id: string
  redirect_uri: string
  holder_did?: string
  state?: string
}

export interface RegisterRequest {
  nik: string
  nama: string
  tanggal_lahir: string
  email: string
  password: string
}

// ============================================
// Express Request Extension
// ============================================

declare global {
  namespace Express {
    interface Request {
      userId?: string
      userNik?: string
      userDid?: string
      cNonce?: string
      accessToken?: string
    }
  }
}
