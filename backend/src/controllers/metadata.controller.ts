/**
 * Metadata Controller — OID4VCI Issuer Discovery
 * 
 * Implements:
 *   GET /.well-known/openid-credential-issuer
 *   GET /.well-known/oauth-authorization-server
 *   GET /.well-known/openid-configuration
 */

import { Request, Response } from 'express'
import { BASE_URL, ISSUER_ENDPOINTS } from '../lib/issuer-url.js'

export class MetadataController {
  /**
   * GET /.well-known/openid-credential-issuer
   * 
   * Returns OID4VCI issuer metadata for wallet discovery.
   * Follows OpenID4VCI Section 10.2 — Credential Issuer Metadata
   */
  static getIssuerMetadata(req: Request, res: Response) {
    const metadata = {
      credential_issuer: BASE_URL,
      authorization_servers: [BASE_URL],
      authorization_endpoint: ISSUER_ENDPOINTS.authorization,
      token_endpoint: ISSUER_ENDPOINTS.token,
      token_endpoint_auth_methods_supported: ['none'],
      credential_endpoint: ISSUER_ENDPOINTS.credential,
      credential_offer_endpoint: ISSUER_ENDPOINTS.credentialOffer,
      credential_status_endpoint: `${ISSUER_ENDPOINTS.credentialStatusBase}/{credentialId}`,
      grant_types_supported: [
        'authorization_code',
        'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      ],
      proof_types_supported: {
        jwt: {
          proof_signing_alg_values_supported: ['EdDSA'],
        },
      },
      credential_configurations_supported: {
        kartu_bpjs_kesehatan: {
          format: 'jwt_vc_json',
          name: 'Kartu BPJS Kesehatan',
          scope: 'kartu_bpjs_kesehatan',
          cryptographic_binding_methods_supported: ['did'],
          proof_types_supported: {
            jwt: {
              proof_signing_alg_values_supported: ['EdDSA'],
            },
          },
          credential_definition: {
            type: ['VerifiableCredential', 'KartuBPJSKesehatan'],
          },
          display: [
            {
              name: 'Kartu BPJS Kesehatan',
              locale: 'id-ID',
              description: 'Kartu identitas peserta BPJS Kesehatan berbasis Verifiable Credential.',
            },
          ],
        },
      },
      credentials_supported: [
        {
          id: 'kartu_bpjs_kesehatan',
          format: 'jwt_vc_json',
          types: ['VerifiableCredential', 'KartuBPJSKesehatan'],
          display: [
            {
              name: 'Kartu BPJS Kesehatan',
              locale: 'id-ID',
            },
          ],
        },
      ],
    }

    res.json(metadata)
  }

  /**
   * GET /.well-known/oauth-authorization-server
   *
   * OAuth 2.0 Authorization Server Metadata for wallets that resolve
   * authorization_server from credential offer grants.
   */
  static getAuthorizationServerMetadata(req: Request, res: Response) {
    return res.json({
      issuer: BASE_URL,
      authorization_endpoint: ISSUER_ENDPOINTS.authorization,
      token_endpoint: ISSUER_ENDPOINTS.token,
      jwks_uri: `${BASE_URL}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      ],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'kartu_bpjs_kesehatan'],
    })
  }

  /**
   * GET /.well-known/openid-configuration
   *
   * OpenID Provider discovery alias for wallets that only implement
   * standard OIDC discovery lookups.
   */
  static getOpenIdConfiguration(req: Request, res: Response) {
    return MetadataController.getAuthorizationServerMetadata(req, res)
  }
}
