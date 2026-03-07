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
  types: string[]
}

export interface CredentialOffer {
  credential_issuer: string
  credential_configuration_ids: string[]
  grants: {
    authorization_code: Record<string, never>
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
}

export interface CredentialRequest {
  format: string
  credential_definition: {
    type: string[]
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
  nik: string
  nama: string
  tanggal_lahir: string
}

// ============================================
// Authorization Types
// ============================================

export interface AuthorizeRequest {
  nik: string
  password: string
  client_id: string
  redirect_uri: string
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
    }
  }
}
